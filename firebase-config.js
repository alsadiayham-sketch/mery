// store data layer — talks to the secure Cloudflare D1 backend at /api/*.
// Exposes a `db` object whose surface matches the subset of the Firestore API
// the app used, so script.js / admin.js / checkout.html keep working unchanged.
// Reads are public; writes carry a Bearer session token. Passwords never reach
// the client — login is verified server-side.
(function (global) {
    var API = '/api';
    var TOKEN_KEY = 'mery_token';
    var USER_KEY = 'mery_user';

    // Firestore collection name -> API resource + JSON response key
    var RESOURCE = {
        products: { ep: 'products', key: 'products' },
        discounts: { ep: 'discounts', key: 'discounts' },
        orders: { ep: 'orders', key: 'orders' },
        heroDisplay: { ep: 'hero', key: 'hero' }
    };

    function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
    function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
    function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); } catch (e) {} }

    function apiFetch(path, opts) {
        opts = opts || {};
        var headers = { 'Content-Type': 'application/json' };
        // Always attach the session token when present. Public endpoints ignore
        // it; authenticated reads/writes (orders, users) require it. This lets the
        // same GET helper serve the public storefront and the logged-in admin.
        var t = getToken();
        if (t) headers['Authorization'] = 'Bearer ' + t;
        var init = { method: opts.method || 'GET', headers: headers };
        if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
        return fetch(API + path, init).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error((data && data.error) || ('HTTP ' + res.status));
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }

    function firstArray(obj) {
        if (!obj) return [];
        for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && Array.isArray(obj[k])) return obj[k]; }
        return [];
    }

    function makeDocSnap(item) {
        var id = item && item.id;
        return {
            id: id,
            exists: !!item,
            data: function () { var c = {}; for (var k in item) c[k] = item[k]; return c; }
        };
    }

    function makeSnapshot(arr) {
        var docs = arr.map(makeDocSnap);
        return {
            empty: arr.length === 0,
            size: arr.length,
            docs: docs,
            forEach: function (cb) { docs.forEach(cb); }
        };
    }

    function sortAndLimit(arr, order, dir, limit) {
        if (order) {
            arr = arr.slice().sort(function (a, b) {
                var av = a[order], bv = b[order];
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                if (av < bv) return dir === 'desc' ? 1 : -1;
                if (av > bv) return dir === 'desc' ? -1 : 1;
                return 0;
            });
        }
        if (limit && limit > 0) arr = arr.slice(0, limit);
        return arr;
    }

    // ---- settings (single 'config' object) ----
    function settingsGet() {
        return apiFetch('/settings').then(function (d) {
            var s = (d && d.settings) || {};
            return {
                id: 'config',
                exists: true,
                data: function () { var c = {}; for (var k in s) c[k] = s[k]; return c; }
            };
        });
    }
    function settingsSet(data) {
        return apiFetch('/settings', { method: 'POST', auth: true, body: data });
    }

    // ---- DocRef ----
    function DocRef(name, id) { this.name = name; this.id = id; }

    DocRef.prototype.get = function () {
        if (this.name === 'settings') return settingsGet();
        var id = this.id;
        if (this.name === 'orders') {
            return makeDocSnap(null);
        }
        var res = RESOURCE[this.name];
        return apiFetch('/' + res.ep).then(function (d) {
            var arr = firstArray(d);
            var found = null;
            for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(id)) { found = arr[i]; break; } }
            return makeDocSnap(found);
        });
    };

    DocRef.prototype.set = function (data, opts) {
        if (this.name === 'settings') return settingsSet(data);
        var res = RESOURCE[this.name];
        var body = {}; for (var k in data) body[k] = data[k];
        var isPublic = this.name === 'orders';
        if (!isPublic) body.id = this.id;
        return apiFetch('/' + res.ep, { method: 'POST', auth: !isPublic, body: body }).then(function (result) {
            if (isPublic && result && result.id) data.id = result.id;
            return result;
        });
    };

    DocRef.prototype.update = function (data) {
        var self = this;
        if (this.name === 'orders') {
            return apiFetch('/orders?id=' + encodeURIComponent(this.id), { method: 'PATCH', auth: true, body: { status: data.status } });
        }
        if (this.name === 'settings') {
            return settingsGet().then(function (snap) {
                var cur = snap.data();
                for (var k in data) cur[k] = data[k];
                return settingsSet(cur);
            });
        }
        // products / discounts / heroDisplay: read-modify-write to emulate merge.
        return self.get().then(function (snap) {
            var cur = snap.exists ? snap.data() : {};
            for (var k in data) cur[k] = data[k];
            return self.set(cur);
        });
    };

    DocRef.prototype.delete = function () {
        var res = RESOURCE[this.name];
        return apiFetch('/' + res.ep + '?id=' + encodeURIComponent(this.id), { method: 'DELETE', auth: true });
    };

    // Polls get() on an interval (emulates Firestore doc onSnapshot). Used for
    // settings/config on the storefront, checkout and admin.
    DocRef.prototype.onSnapshot = function (onNext, onError) {
        var self = this;
        var stopped = false;
        var INTERVAL = 8000;
        function poll() {
            if (stopped) return;
            self.get().then(function (snap) {
                if (!stopped && typeof onNext === 'function') onNext(snap);
            }).catch(function (err) {
                if (!stopped && typeof onError === 'function') onError(err);
            });
        }
        poll();
        var timer = setInterval(poll, INTERVAL);
        return function () { stopped = true; clearInterval(timer); };
    };

    // ---- Collection / Query ----
    function Collection(name, order, dir, limit) {
        this.name = name; this._order = order || null; this._dir = dir || 'asc'; this._limit = limit || 0;
    }
    Collection.prototype.orderBy = function (field, dir) { return new Collection(this.name, field, dir || 'asc', this._limit); };
    Collection.prototype.limit = function (n) { return new Collection(this.name, this._order, this._dir, n); };
    Collection.prototype.doc = function (id) { return new DocRef(this.name, id); };

    Collection.prototype.add = function (data) {
        var res = RESOURCE[this.name];
        var isPublic = this.name === 'orders';
        return apiFetch('/' + res.ep, { method: 'POST', auth: !isPublic, body: data }).then(function (d) {
            return { id: d && d.id };
        });
    };

    Collection.prototype.get = function () {
        var self = this;
        var res = RESOURCE[this.name];
        return apiFetch('/' + res.ep).then(function (d) {
            var arr = sortAndLimit(firstArray(d), self._order, self._dir, self._limit);
            return makeSnapshot(arr);
        });
    };

    Collection.prototype.onSnapshot = function (onNext, onError) {
        var self = this;
        var stopped = false;
        var INTERVAL = 8000;
        function poll() {
            if (stopped) return;
            self.get().then(function (snap) {
                if (!stopped && typeof onNext === 'function') onNext(snap);
            }).catch(function (err) {
                if (!stopped && typeof onError === 'function') onError(err);
            });
        }
        poll();
        var timer = setInterval(poll, INTERVAL);
        return function () { stopped = true; clearInterval(timer); };
    };

    // settings is accessed as db.collection('settings').doc('config')
    function SettingsCollection() {}
    SettingsCollection.prototype.doc = function () { return new DocRef('settings', 'config'); };

    var db = {
        collection: function (name) {
            if (name === 'settings') return new SettingsCollection();
            return new Collection(name);
        },
        batch: function () {
            var ops = [];
            return {
                set: function (ref, data, opts) { ops.push({ t: 'set', ref: ref, data: data, opts: opts }); },
                update: function (ref, data) { ops.push({ t: 'update', ref: ref, data: data }); },
                delete: function (ref) { ops.push({ t: 'delete', ref: ref }); },
                commit: function () {
                    return ops.reduce(function (p, op) {
                        return p.then(function () {
                            if (op.t === 'set') return op.ref.set(op.data, op.opts);
                            if (op.t === 'update') return op.ref.update(op.data);
                            if (op.t === 'delete') return op.ref.delete();
                        });
                    }, Promise.resolve());
                }
            };
        }
    };

    // ---- auth API used by admin.js ----
    var storeAuth = {
        login: function (username, password) {
            return apiFetch('/login', { method: 'POST', body: { username: username, password: password } })
                .then(function (d) {
                    setToken(d.token);
                    try { sessionStorage.setItem(USER_KEY, JSON.stringify(d.user)); } catch (e) {}
                    return d.user;
                });
        },
        session: function () {
            if (!getToken()) return Promise.resolve(null);
            return apiFetch('/session', { auth: true }).then(function (d) { return d.user; }).catch(function () { clearToken(); return null; });
        },
        getUser: function () { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } },
        getToken: getToken,
        logout: function () { clearToken(); },
        killAll: function () { return apiFetch('/logout-all', { method: 'POST', auth: true }); },
        changePassword: function (currentPassword, newPassword, confirmPassword) {
            return apiFetch('/change-password', {
                method: 'POST',
                auth: true,
                body: { currentPassword: currentPassword, newPassword: newPassword, confirmPassword: confirmPassword }
            });
        },
        // user management (admin only)
        listUsers: function () { return apiFetch('/users', { auth: true }).then(function (d) { return d.users || []; }); },
        saveUser: function (u) { return apiFetch('/users', { method: 'POST', auth: true, body: u }); },
        deleteUser: function (username) { return apiFetch('/users?username=' + encodeURIComponent(username), { method: 'DELETE', auth: true }); },
        apiFetch: apiFetch
    };

    global.db = db;
    global.getTrackedOrder = function (id, phone) {
        return apiFetch('/orders?id=' + encodeURIComponent(id) + '&phone=' + encodeURIComponent(phone || ''))
            .then(function (data) { return data && data.order ? data.order : null; })
            .catch(function () { return null; });
    };
    global.storeAuth = storeAuth;
    global.PROJECT_ID = 'mery';
})(window);
