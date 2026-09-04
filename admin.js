var FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27400%27 height=%27400%27 viewBox=%270 0 400 400%27%3E%3Crect width=%27400%27 height=%27400%27 fill=%27%23fff8cf%27/%3E%3Ccircle cx=%27200%27 cy=%27165%27 r=%2765%27 fill=%27%23f05f91%27 opacity=%27.18%27/%3E%3Ctext x=%27200%27 y=%27275%27 text-anchor=%27middle%27 font-family=%27Arial%27 font-size=%2732%27 fill=%27%23dc4c7f%27%3EMery Beauty%3C/text%3E%3C/svg%3E";

function hashString(str) {
    var encoder = new TextEncoder();
    return crypto.subtle.digest('SHA-256', encoder.encode(str)).then(function (buffer) {
        return Array.from(new Uint8Array(buffer)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
}

var products = [];
var discounts = [];
var orders = [];
var heroSlides = [];
var siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
var charts = {};
var isInitializing = false;
var adminRefreshTimer = null;

var adminReady = {
    products: false,
    discounts: false,
    orders: false,
    settings: false
};

document.addEventListener('DOMContentLoaded', function () {
    storeAuth.session().then(function (user) {
        if (user) {
            currentUser = user;
            showAdminPanel();
            initializeAdmin();
        }
    });
});

var currentUser = null;

function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    applyRolePermissions();
}

function setAdminLoading(loading) {
    var loader = document.getElementById('adminLoading');
    if (loader) loader.style.display = loading ? 'block' : 'none';
}

var _statusTimeout = null;
function setAdminStatus(message, type) {
    var status = document.getElementById('adminStatus');
    if (!status) return;
    if (_statusTimeout) clearTimeout(_statusTimeout);
    status.classList.remove('hidden');
    status.textContent = message;
    status.className = 'admin-status' + (type ? ' ' + type : '');
    if (type === 'success') {
        _statusTimeout = setTimeout(function () {
            status.style.opacity = '0';
            setTimeout(function () {
                status.textContent = '';
                status.className = 'admin-status hidden';
                status.style.opacity = '';
            }, 500);
        }, 5000);
    }
}

function handleLogin(event) {
    event.preventDefault();
    var user = document.getElementById('loginUser').value.trim();
    var pass = document.getElementById('loginPass').value;
    var errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    storeAuth.login(user, pass).then(function (loggedIn) {
        currentUser = loggedIn;
        showAdminPanel();
        initializeAdmin();
    }).catch(function (err) {
        if (err && err.status === 401) {
            errorEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
        } else {
            errorEl.textContent = 'تعذر تسجيل الدخول، حاولي مرة أخرى';
        }
    });
}

function logout() {
    storeAuth.logout();
    location.reload();
}

function killAllSessions() {
    if (!confirm('سيتم تسجيل خروج جميع المستخدمين بما فيهم أنت. متأكد؟')) return;
    storeAuth.killAll().then(function () {
        setAdminStatus('تم إنهاء جميع الجلسات', 'success');
        setTimeout(function () { logout(); }, 1500);
    }).catch(function () {
        setAdminStatus('تعذر إنهاء الجلسات حالياً', 'error');
    });
}

function changeOwnPassword(event) {
    event.preventDefault();
    var currentPassword = document.getElementById('currentPassword').value;
    var newPassword = document.getElementById('newPassword').value;
    var confirmPassword = document.getElementById('confirmPassword').value;
    var button = document.getElementById('changePasswordBtn');
    if (newPassword.length < 6) {
        setAdminStatus('يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        setAdminStatus('كلمتا المرور الجديدتان غير متطابقتين.', 'error');
        return;
    }
    button.disabled = true;
    button.textContent = 'جاري الحفظ...';
    storeAuth.changePassword(currentPassword, newPassword, confirmPassword).then(function () {
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        setAdminStatus('تم تغيير كلمة المرور. سيتم تسجيل خروجك الآن.', 'success');
        setTimeout(function () { logout(); }, 1200);
    }).catch(function (err) {
        var message = err && err.message;
        if (message === 'current password is incorrect') message = 'كلمة المرور الحالية غير صحيحة.';
        else if (message === 'new passwords do not match') message = 'كلمتا المرور الجديدتان غير متطابقتين.';
        else if (message === 'password must be at least 6 characters') message = 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.';
        else message = 'تعذر تغيير كلمة المرور حالياً. حاولي مرة أخرى.';
        setAdminStatus(message, 'error');
        button.disabled = false;
        button.textContent = 'تغيير كلمة المرور';
    });
}

function switchTab(tab, button) {
    document.querySelectorAll('.tab-content').forEach(function (content) { content.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (tabButton) { tabButton.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
    if (button) {
        button.classList.add('active');
    } else {
        var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
        if (btn) btn.classList.add('active');
    }
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'orders') renderOrdersTable();
    if (tab === 'hero') renderHeroTable();
    if (tab === 'users') loadUsers();
}

function applyRolePermissions() {
    var isWorker = currentUser && currentUser.role === 'worker';
    var hiddenTabs = ['dashboard', 'products', 'hero', 'settings', 'users'];
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
        var tab = btn.getAttribute('data-tab');
        btn.style.display = (isWorker && hiddenTabs.indexOf(tab) >= 0) ? 'none' : '';
    });
    var label = document.getElementById('currentUserLabel');
    if (label && currentUser) {
        label.textContent = currentUser.name + ' · ' + (isWorker ? 'موظف الطلبات' : 'مدير');
    }
    if (isWorker) switchTab('orders');
}

var usersList = [];

function loadUsers() {
    if (!currentUser || currentUser.role !== 'admin') return;
    storeAuth.listUsers().then(function (list) {
        usersList = list;
        renderUsersTable();
    }).catch(function () {
        setAdminStatus('تعذر تحميل قائمة الموظفين.', 'error');
    });
}

function renderUsersTable() {
    var tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    var rows = usersList.map(function (u) {
        var roleLabel = u.role === 'worker' ? 'موظف' : 'مدير';
        return '<tr><td>' + escapeHtml(u.username) + '</td><td>' + escapeHtml(u.name || '') + '</td><td>' + roleLabel +
            '</td><td><button class="action-link" onclick="editUser(\'' + escapeHtml(u.username) + '\')">تعديل</button>' +
            '<button class="action-link" onclick="removeUser(\'' + escapeHtml(u.username) + '\')">حذف</button></td></tr>';
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="4">لا يوجد موظفون.</td></tr>';
}

function saveUser(event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== 'admin') return;
    var username = String(document.getElementById('userUsername').value || '').trim();
    if (!username) return;
    var payload = {
        username: username,
        name: document.getElementById('userName').value || username,
        role: document.getElementById('userRole').value === 'worker' ? 'worker' : 'admin',
        password: document.getElementById('userPassword').value
    };
    storeAuth.saveUser(payload).then(function (result) {
        document.getElementById('userUsername').value = '';
        document.getElementById('userName').value = '';
        document.getElementById('userPassword').value = '';
        if (result && result.sessionInvalidated) {
            setAdminStatus('تم حفظ الموظف. سيتم تسجيل خروجك لحماية الحسابات.', 'success');
            setTimeout(function () { logout(); }, 1200);
            return;
        }
        setAdminStatus('تم حفظ الموظف.', 'success');
        loadUsers();
    }).catch(function (err) {
        setAdminStatus((err && err.message) ? err.message : 'تعذر حفظ الموظف.', 'error');
    });
}

function editUser(username) {
    var u = null;
    for (var i = 0; i < usersList.length; i++) { if (usersList[i].username === username) { u = usersList[i]; break; } }
    if (!u) return;
    document.getElementById('userUsername').value = u.username;
    document.getElementById('userName').value = u.name || '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = u.role || 'admin';
}

function removeUser(username) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (username === currentUser.username) { alert('لا يمكنك حذف حسابك الحالي.'); return; }
    if (!confirm('حذف الموظف ' + username + '؟')) return;
    storeAuth.deleteUser(username).then(function (result) {
        if (result && result.sessionInvalidated) {
            setAdminStatus('تم حذف الموظف. سيتم تسجيل خروجك لحماية الحسابات.', 'success');
            setTimeout(function () { logout(); }, 1200);
            return;
        }
        setAdminStatus('تم حذف الموظف.', 'success');
        loadUsers();
    }).catch(function (err) {
        setAdminStatus((err && err.message) ? err.message : 'تعذر حذف الموظف.', 'error');
    });
}

async function initializeAdmin() {
    if (isInitializing) return;
    isInitializing = true;
    setAdminLoading(true);
    setAdminStatus('جاري مزامنة بيانات المتجر...', '');

    if (!window.db) {
        setAdminLoading(false);
        setAdminStatus('تعذر الاتصال بقاعدة بيانات المتجر. تأكدي من الاتصال بالإنترنت.', 'error');
        isInitializing = false;
        return;
    }

    try {
        await ensureSeedIfEmpty();
        await loadAdminData(false);
    } catch (error) {
        console.error(error);
        setAdminStatus('حدث خطأ أثناء تحميل البيانات.', 'error');
        setAdminLoading(false);
    }

    isInitializing = false;
}

async function ensureSeedIfEmpty() {
    var snapshot = await db.collection('products').limit(1).get();
    if (snapshot.empty) {
        setAdminStatus('المتجر فارغ، جاري تنفيذ Seed Data تلقائياً...', 'warning');
        await seedFirestoreData(false);
    }
}

async function loadAdminData(isRefresh) {
    if (isRefresh) setAdminLoading(true);
    var results = await Promise.all([
        db.collection('products').get(),
        db.collection('discounts').get(),
        db.collection('orders').orderBy('date', 'desc').get(),
        db.collection('settings').doc('config').get(),
        db.collection('heroDisplay').orderBy('order', 'asc').get()
    ]);

    products = results[0].docs.map(function (docSnap) { var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d); });
    discounts = results[1].docs.map(function (docSnap) { return normalizeDiscount(docSnap.data()); });
    orders = results[2].docs.map(function (docSnap) {
        var data = docSnap.data();
        data._docId = docSnap.id;
        return data;
    });
    siteSettings = normalizeSettings(results[3].exists ? results[3].data() : DEFAULT_SITE_SETTINGS);
    heroSlides = results[4].docs.map(function (docSnap) { var d = docSnap.data(); d.id = docSnap.id; return d; });

    adminReady.products = true;
    adminReady.discounts = true;
    adminReady.orders = true;
    adminReady.settings = true;
    renderProductsTable();
    renderDiscountValueOptions();
    renderDiscountsTable();
    renderOrdersTable();
    renderDashboard();
    loadSettingsForm();
    renderHeroTable();
    setAdminLoading(false);
    if (!isRefresh) setAdminStatus('تمت مزامنة البيانات بنجاح.', 'success');
}

function scheduleAdminRefresh() {
    if (isInitializing) return;
    if (adminRefreshTimer) clearTimeout(adminRefreshTimer);
    adminRefreshTimer = setTimeout(function () {
        loadAdminData(true).catch(function (error) {
            console.error(error);
            setAdminLoading(false);
            setAdminStatus('تعذر تحديث البيانات بعد الحفظ.', 'error');
        });
    }, 250);
}

window.addEventListener('mery:data-changed', scheduleAdminRefresh);

function renderProductsTable() {
    var tbody = document.getElementById('productsTableBody');
    var statusLabels = { normal: 'عادي', bestseller: 'الأكثر مبيعاً', special: 'مميز', soldout: 'نفذت الكمية' };
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">لا توجد منتجات حالياً.</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(function (product) {
        return '<tr><td><input type="checkbox" class="product-select" value="' + product.id + '" onchange="updateBulkBar()"></td><td><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"></td><td>' + product.name + '</td><td>' + product.brand + '</td><td>' + product.category + '</td><td>' + formatSizes(product) + '</td><td>' + formatPrices(product) + '</td><td><input class="stock-input" type="number" min="0" step="1" value="' + product.stock + '" aria-label="مخزون ' + product.name + '" onchange="updateProductStock(\'' + product.id + '\', this)"></td><td>' + (product.discount ? product.discount + '%' : '-') + '</td><td><span class="status-tag ' + (product.status || 'normal') + '">' + statusLabels[product.status || 'normal'] + '</span></td><td class="actions"><button class="btn-edit" onclick="editProduct(\'' + product.id + '\')">تعديل</button><button class="btn-delete" onclick="deleteProduct(\'' + product.id + '\')">حذف</button></td></tr>';
    }).join('');
    updateBulkBar();
}

function updateProductStock(productId, input) {
    var stock = Number(input.value);
    if (!Number.isInteger(stock) || stock < 0) {
        input.value = products.find(function (product) { return product.id === productId; }).stock;
        return;
    }
    input.disabled = true;
    storeAuth.updateProductStock(productId, stock).then(function () {
        var product = products.find(function (entry) { return entry.id === productId; });
        if (product) product.stock = stock;
        setAdminStatus('تم تحديث المخزون.', 'success');
    }).catch(function () {
        setAdminStatus('تعذر تحديث المخزون.', 'error');
    }).finally(function () {
        input.disabled = false;
    });
}

function getSelectedProductIds() {
    var checkboxes = document.querySelectorAll('.product-select:checked');
    var ids = [];
    for (var i = 0; i < checkboxes.length; i++) {
        ids.push(checkboxes[i].value);
    }
    return ids;
}

function toggleSelectAll(masterCheckbox) {
    var checkboxes = document.querySelectorAll('.product-select');
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = masterCheckbox.checked;
    }
    updateBulkBar();
}

function updateBulkBar() {
    var selected = getSelectedProductIds();
    var bar = document.getElementById('bulkActionsBar');
    var count = document.getElementById('bulkSelectedCount');
    if (selected.length > 0) {
        bar.style.display = 'flex';
        count.textContent = selected.length;
    } else {
        bar.style.display = 'none';
    }
}

async function bulkChangeStatus() {
    var ids = getSelectedProductIds();
    var status = document.getElementById('bulkStatusSelect').value;
    if (!ids.length || !status) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.update(db.collection('products').doc(String(id)), { status: status });
    });
    await batch.commit();
    document.getElementById('bulkStatusSelect').value = '';
}

async function bulkApplyDiscount() {
    var ids = getSelectedProductIds();
    var discount = parseInt(document.getElementById('bulkDiscountInput').value, 10);
    if (!ids.length || isNaN(discount) || discount < 0 || discount > 99) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.update(db.collection('products').doc(String(id)), { discount: discount });
    });
    await batch.commit();
    document.getElementById('bulkDiscountInput').value = '';
}

async function bulkDeleteProducts() {
    var ids = getSelectedProductIds();
    if (!ids.length) return;
    if (!confirm('هل تريد حذف ' + ids.length + ' منتج؟')) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.delete(db.collection('products').doc(String(id)));
    });
    await batch.commit();
    var selectAll = document.getElementById('selectAllProducts');
    if (selectAll) selectAll.checked = false;
}

function formatSizes(product) {
    return product.sizes.map(function (size) { return getSizeLabel(size); }).join(' / ');
}

function formatPrices(product) {
    var prices = product.sizes.map(function (size) { return size.price; });
    if (!prices.length) return '-';
    if (prices.length === 1) return formatCurrency(prices[0]);
    return formatCurrency(Math.min.apply(null, prices)) + ' - ' + formatCurrency(Math.max.apply(null, prices));
}

function createEmptySize() { return { size: 'واحد', unit: 'قطعة', price: '' }; }

function addSizeRow(sizeData) {
    var safeSize = sizeData || createEmptySize();
    var container = document.getElementById('sizesContainer');
    var row = document.createElement('div');
    row.className = 'size-row';
    row.innerHTML = '<input type="text" class="size-value" placeholder="الحجم أو النوع" value="' + safeSize.size + '"><select class="size-unit"><option value="قطعة" ' + (safeSize.unit === 'قطعة' ? 'selected' : '') + '>قطعة</option><option value="ml" ' + (safeSize.unit === 'ml' ? 'selected' : '') + '>مل (ml)</option><option value="g" ' + (safeSize.unit === 'g' ? 'selected' : '') + '>غرام (g)</option></select><input type="number" class="size-price" min="0" placeholder="السعر ₪" value="' + safeSize.price + '"><button type="button" class="btn-remove-size" onclick="removeSizeRow(this)">حذف</button>';
    container.appendChild(row);
}

function removeSizeRow(button) {
    var container = document.getElementById('sizesContainer');
    if (container.children.length === 1) return;
    button.closest('.size-row').remove();
}

function renderSizeRows(sizes) {
    var container = document.getElementById('sizesContainer');
    container.innerHTML = '';
    (sizes && sizes.length ? sizes : [createEmptySize()]).forEach(function (size) { addSizeRow(size); });
}

function openProductModal(product) {
    document.getElementById('productModalTitle').textContent = product ? 'تعديل المنتج' : 'إضافة منتج جديد';
    document.getElementById('productId').value = product ? product.id : '';
    document.getElementById('productName').value = product ? product.name : '';
    document.getElementById('productBrand').value = product ? product.brand : '';
    document.getElementById('productCategory').value = product ? product.category : '';
    document.getElementById('productDiscount').value = product ? product.discount : 0;
    document.getElementById('productImage').value = product ? product.image : '';
    document.getElementById('productImageFile').value = '';
    document.getElementById('imagePreview').innerHTML = product && product.image ? '<img src="' + product.image + '" onerror="this.style.display=\'none\'">' : '';
    document.getElementById('productStatus').value = product ? product.status : 'normal';
    renderSizeRows(product ? product.sizes : [createEmptySize()]);
    document.getElementById('brandsList').innerHTML = Array.from(new Set(products.map(function (entry) { return entry.brand; }))).map(function (brand) { return '<option value="' + brand + '">'; }).join('');
    document.getElementById('categoriesList').innerHTML = Array.from(new Set(products.map(function (entry) { return entry.category; }))).map(function (category) { return '<option value="' + category + '">'; }).join('');
    document.getElementById('productModal').style.display = 'flex';
}

function editProduct(id) {
    var product = products.find(function (entry) { return entry.id === id; });
    if (product) openProductModal(product);
}

function collectSizes() {
    return Array.from(document.querySelectorAll('#sizesContainer .size-row')).map(function (row) {
        return {
            size: row.querySelector('.size-value').value.trim(),
            unit: row.querySelector('.size-unit').value,
            price: parseFloat(row.querySelector('.size-price').value || '0')
        };
    }).filter(function (size) { return size.size && size.price > 0; });
}

async function saveProduct(event) {
    event.preventDefault();
    var id = document.getElementById('productId').value;
    var sizes = collectSizes();
    if (!sizes.length) return alert('أضيفي حجماً واحداً على الأقل مع السعر.');

    var nextId = id ? id : 'product_' + Date.now();

    // Handle image upload
    var imageUrl = document.getElementById('productImage').value.trim();
    var fileInput = document.getElementById('productImageFile');
    if (fileInput.files && fileInput.files[0]) {
        setAdminLoading(true);
        setAdminStatus('جاري معالجة الوسائط...', 'info');
        imageUrl = await uploadProductMedia(fileInput.files[0], nextId);
    }

    var productData = normalizeProduct({
        id: nextId,
        name: document.getElementById('productName').value.trim(),
        brand: document.getElementById('productBrand').value.trim(),
        category: document.getElementById('productCategory').value.trim(),
        sizes: sizes,
        discount: parseInt(document.getElementById('productDiscount').value || '0', 10) || 0,
        image: imageUrl,
        status: document.getElementById('productStatus').value
    });

    setAdminLoading(true);
    await db.collection('products').doc(String(productData.id)).set(productData, { merge: false });
    setAdminLoading(false);
    closeModal('productModal');
    setAdminStatus('تم حفظ المنتج بنجاح.', 'success');
}

async function deleteProduct(id) {
    if (!confirm('هل أنتِ متأكدة من حذف هذا المنتج؟')) return;
    setAdminLoading(true);
    await db.collection('products').doc(String(id)).delete();
    setAdminLoading(false);
    setAdminStatus('تم حذف المنتج.', 'success');
}

function renderDiscountValueOptions() {
    var type = document.getElementById('discountType');
    var container = document.getElementById('discountValueCheckboxes');
    if (!type || !container) return;
    var mode = type.value;
    var values = [];
    if (mode === 'brand') {
        values = Array.from(new Set(products.map(function (product) { return product.brand; })));
    } else if (mode === 'category') {
        values = Array.from(new Set(products.map(function (product) { return product.category; })));
    }
    container.innerHTML = values.map(function (value) {
        return '<label class="checkbox-item"><input type="checkbox" value="' + value + '"><span>' + value + '</span></label>';
    }).join('');
}

function toggleDiscountValueField() {
    var type = document.getElementById('discountType').value;
    document.getElementById('discountValueGroup').style.display = (type === 'brand' || type === 'category') ? 'block' : 'none';
    document.getElementById('discountManualGroup').style.display = type === 'manual' ? 'block' : 'none';
    if (type === 'brand' || type === 'category') renderDiscountValueOptions();
}

function renderDiscountsTable() {
    var tbody = document.getElementById('discountsTableBody');
    if (!discounts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا توجد خصومات مضافة.</td></tr>';
        return;
    }
    var typeLabels = { brand: 'ماركة', category: 'فئة', manual: 'يدوي', all: 'جميع المنتجات' };
    var now = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = discounts.map(function (discount) {
        var expired = discount.expiresAt && discount.expiresAt < now;
        var expiryText = discount.expiresAt ? discount.expiresAt : 'بدون تاريخ';
        var rowClass = expired ? ' style="opacity:0.5;"' : '';
        return '<tr' + rowClass + '><td>' + typeLabels[discount.type] + '</td><td>' + (discount.type === 'all' ? 'الكل' : discount.value) + '</td><td>' + discount.percentage + '%</td><td>' + expiryText + (expired ? ' (منتهي)' : '') + '</td><td>' + discount.description + '</td><td class="actions"><button class="btn-edit" onclick="editDiscount(\'' + discount.id + '\')">تعديل</button><button class="btn-delete" onclick="deleteDiscount(\'' + discount.id + '\')">حذف</button></td></tr>';
    }).join('');
}

function openDiscountModal(discount) {
    document.getElementById('discountModalTitle').textContent = discount ? 'تعديل خصم' : 'إضافة خصم';
    document.getElementById('discountId').value = discount ? discount.id : '';
    document.getElementById('discountType').value = discount ? discount.type : 'all';
    toggleDiscountValueField();
    if (discount && (discount.type === 'brand' || discount.type === 'category')) {
        var container = document.getElementById('discountValueCheckboxes');
        var vals = discount.values || [];
        var checkboxes = container.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].checked = vals.indexOf(checkboxes[i].value) >= 0;
        }
    }
    document.getElementById('discountManualValue').value = discount && discount.type === 'manual' ? discount.value : '';
    document.getElementById('discountPercentage').value = discount ? discount.percentage : '';
    document.getElementById('discountExpiry').value = discount ? (discount.expiresAt || '') : '';
    document.getElementById('discountDescription').value = discount ? discount.description : '';
    document.getElementById('discountModal').style.display = 'flex';
}

function editDiscount(id) {
    var discount = discounts.find(function (entry) { return entry.id === id; });
    if (discount) openDiscountModal(discount);
}

async function saveDiscount(event) {
    event.preventDefault();
    var existingId = document.getElementById('discountId').value;
    var type = document.getElementById('discountType').value;
    var values = [];
    if (type === 'brand' || type === 'category') {
        var container = document.getElementById('discountValueCheckboxes');
        var checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        for (var i = 0; i < checkboxes.length; i++) {
            values.push(checkboxes[i].value);
        }
    } else if (type === 'manual') {
        var manualVal = document.getElementById('discountManualValue').value.trim();
        if (manualVal) values = [manualVal];
    }
    // For "all" type, values stays empty (applies to everything)
    var discountData = normalizeDiscount({
        id: existingId || String(Date.now()),
        type: type,
        values: values,
        value: values.join(', '),
        percentage: parseInt(document.getElementById('discountPercentage').value || '0', 10),
        description: document.getElementById('discountDescription').value.trim(),
        expiresAt: document.getElementById('discountExpiry').value || ''
    });

    setAdminLoading(true);
    await db.collection('discounts').doc(String(discountData.id)).set(discountData, { merge: false });
    setAdminLoading(false);
    closeModal('discountModal');
    setAdminStatus('تم حفظ الخصم.', 'success');
}

async function deleteDiscount(id) {
    if (!confirm('حذف هذا الخصم؟')) return;
    setAdminLoading(true);
    await db.collection('discounts').doc(String(id)).delete();
    setAdminLoading(false);
    setAdminStatus('تم حذف الخصم.', 'success');
}

function loadSettingsForm() {
    document.getElementById('settingWhatsappNumber').value = siteSettings.whatsappNumber || '';
    document.getElementById('settingHero').value = siteSettings.heroSubtitle || '';
    document.getElementById('settingAbout').value = siteSettings.aboutText || '';
    document.getElementById('settingInstagram').value = siteSettings.instagramLink || '';
    document.getElementById('settingTiktok').value = siteSettings.tiktokLink || '';
    var heroBrandName = document.getElementById('heroBrandName');
    if (heroBrandName) heroBrandName.value = siteSettings.heroTitle || '';
    renderDeliverySettings();
}

function renderDeliverySettings() {
    var zonesContainer = document.getElementById('deliveryZonesSettings');
    var locationsContainer = document.getElementById('pickupLocationsSettings');
    if (zonesContainer) {
        zonesContainer.innerHTML = siteSettings.deliveryZones.map(function (zone) {
            return '<div class="settings-list-row" data-zone-id="' + escapeHtml(zone.id) + '">' +
                '<div class="form-group"><label>المنطقة</label><input class="delivery-zone-name" type="text" value="' + escapeHtml(zone.name) + '" required></div>' +
                '<div class="form-group"><label>السعر ₪</label><input class="delivery-zone-price" type="number" min="0" step="1" value="' + zone.price + '" required></div>' +
                '<div class="form-group"><label>وصف اختياري</label><input class="delivery-zone-description" type="text" value="' + escapeHtml(zone.description) + '"></div>' +
                '<button type="button" class="btn-delete" onclick="this.closest(\'.settings-list-row\').remove()">حذف</button></div>';
        }).join('') || '<p class="form-help">لا توجد مناطق توصيل. أضيفي منطقة لتفعيل التوصيل.</p>';
    }
    if (locationsContainer) {
        locationsContainer.innerHTML = siteSettings.pickupLocations.map(function (location) {
            return '<div class="settings-list-row pickup-row" data-location-id="' + escapeHtml(location.id) + '">' +
                '<div class="form-group"><label>اسم نقطة الاستلام</label><input class="pickup-location-name" type="text" value="' + escapeHtml(location.name) + '" required></div>' +
                '<div class="form-group"><label>العنوان أو الملاحظة</label><input class="pickup-location-address" type="text" value="' + escapeHtml(location.address) + '"></div>' +
                '<button type="button" class="btn-delete" onclick="this.closest(\'.settings-list-row\').remove()">حذف</button></div>';
        }).join('') || '<p class="form-help">لا توجد نقاط استلام. أضيفي نقطة لتفعيل الاستلام الذاتي.</p>';
    }
}

function addDeliveryZone() {
    var current = readDeliverySettings();
    siteSettings.deliveryZones = current.deliveryZones;
    siteSettings.pickupLocations = current.pickupLocations;
    siteSettings.deliveryZones.push({ id: 'zone_' + Date.now(), name: '', price: 0, description: '' });
    renderDeliverySettings();
    var input = document.querySelector('#deliveryZonesSettings .delivery-zone-name:last-of-type');
    if (input) input.focus();
}

function addPickupLocation() {
    var current = readDeliverySettings();
    siteSettings.deliveryZones = current.deliveryZones;
    siteSettings.pickupLocations = current.pickupLocations;
    siteSettings.pickupLocations.push({ id: 'pickup_' + Date.now(), name: '', address: '' });
    renderDeliverySettings();
    var input = document.querySelector('#pickupLocationsSettings .pickup-location-name:last-of-type');
    if (input) input.focus();
}

function readDeliverySettings() {
    var zones = Array.from(document.querySelectorAll('#deliveryZonesSettings .settings-list-row')).map(function (row) {
        return {
            id: row.dataset.zoneId,
            name: row.querySelector('.delivery-zone-name').value.trim(),
            price: Math.round(Number(row.querySelector('.delivery-zone-price').value)),
            description: row.querySelector('.delivery-zone-description').value.trim()
        };
    }).filter(function (zone) { return zone.name && Number.isFinite(zone.price) && zone.price >= 0; });
    var locations = Array.from(document.querySelectorAll('#pickupLocationsSettings .settings-list-row')).map(function (row) {
        return {
            id: row.dataset.locationId,
            name: row.querySelector('.pickup-location-name').value.trim(),
            address: row.querySelector('.pickup-location-address').value.trim()
        };
    }).filter(function (location) { return location.name; });
    return { deliveryZones: zones, pickupLocations: locations };
}

async function saveSettingsForm(event) {
    event.preventDefault();
    var deliverySettings = readDeliverySettings();
    siteSettings = normalizeSettings({
        whatsappNumber: document.getElementById('settingWhatsappNumber').value,
        heroTitle: siteSettings.heroTitle,
        heroSubtitle: document.getElementById('settingHero').value,
        aboutText: document.getElementById('settingAbout').value,
        instagramLink: document.getElementById('settingInstagram').value,
        tiktokLink: document.getElementById('settingTiktok').value,
        deliveryZones: deliverySettings.deliveryZones,
        pickupLocations: deliverySettings.pickupLocations
    });
    setAdminLoading(true);
    await db.collection('settings').doc('config').set(siteSettings, { merge: true });
    setAdminLoading(false);
    setAdminStatus('تم حفظ الإعدادات بنجاح.', 'success');
}

async function saveHeroBranding(event) {
    event.preventDefault();
    var title = document.getElementById('heroBrandName').value.trim();
    if (!title) {
        setAdminStatus('أدخلي اسم الواجهة أولاً.', 'error');
        return;
    }
    siteSettings = normalizeSettings(Object.assign({}, siteSettings, { heroTitle: title }));
    setAdminLoading(true);
    try {
        await db.collection('settings').doc('config').set(siteSettings, { merge: true });
        setAdminStatus('تم حفظ اسم الواجهة بنجاح.', 'success');
    } catch (err) {
        setAdminStatus('تعذر حفظ اسم الواجهة حالياً.', 'error');
    } finally {
        setAdminLoading(false);
    }
}

function renderOrdersTable() {
    var tbody = document.getElementById('ordersTableBody');
    var search = (document.getElementById('orderSearchInput') ? document.getElementById('orderSearchInput').value : '').trim().toLowerCase();
    var statusFilter = document.getElementById('orderStatusFilter') ? document.getElementById('orderStatusFilter').value : 'all';

    var filteredOrders = orders.filter(function (order) {
        var matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        var haystack = (String(order.customerName || '') + ' ' + String(order.customerPhone || '')).toLowerCase();
        return matchesStatus && (!search || haystack.indexOf(search) >= 0);
    }).sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    if (!filteredOrders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد طلبات مطابقة.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredOrders.map(function (order) {
        var itemsCount = (order.items || []).reduce(function (sum, item) { return sum + (Number(item.qty) || 0); }, 0);
        var deliveryText = order.delivery === 'pickup' ? ('استلام' + (order.pickupLocationName ? ' · ' + order.pickupLocationName : '')) : (order.regionName || DELIVERY_REGION_LABEL(order.region));
        var safeId = escapeHtml(order.id || '');
        return '<tr class="order-main-row" data-order-id="' + safeId + '"><td>' + safeId + '</td><td>' + escapeHtml(formatDateTime(order.date)) + '</td><td>' + escapeHtml(order.customerName || '-') + '</td><td>' + escapeHtml(order.customerPhone || '-') + '</td><td>' + itemsCount + '</td><td>' + escapeHtml(formatCurrency(order.total)) + '</td><td>' + escapeHtml(deliveryText) + '</td><td><select class="order-status-select" data-order-id="' + safeId + '">' + ['new', 'processing', 'completed', 'cancelled'].map(function (status) { return '<option value="' + status + '" ' + (order.status === status ? 'selected' : '') + '>' + escapeHtml(ORDER_STATUS_LABEL(status)) + '</option>'; }).join('') + '</select></td></tr><tr class="order-details-row" data-order-details="' + safeId + '" style="display:none;"><td colspan="8">' + renderOrderDetails(order) + '</td></tr>';
    }).join('');

    tbody.querySelectorAll('.order-main-row').forEach(function (row) {
        row.addEventListener('click', function () { toggleOrderDetails(row.dataset.orderId); });
    });
    tbody.querySelectorAll('.order-status-select').forEach(function (select) {
        select.addEventListener('click', function (event) { event.stopPropagation(); });
        select.addEventListener('change', function () { updateOrderStatus(select.dataset.orderId, select.value); });
    });
}

function renderOrderDetails(order) {
    var itemsHtml = (order.items || []).map(function (item) {
        return '<div class="order-item-card"><strong>' + escapeHtml(item.name || '') + '</strong><div>' + escapeHtml(item.brand || '') + ' • ' + escapeHtml(item.sizeLabel || '') + '</div><div>الكمية: ' + (parseInt(item.qty, 10) || 0) + ' • السعر: ' + escapeHtml(formatCurrency(item.price)) + ' • الإجمالي: ' + escapeHtml(formatCurrency(item.lineTotal)) + '</div></div>';
    }).join('');

    var destination = order.delivery === 'pickup' ? (order.pickupLocationName || 'استلام ذاتي') : (order.regionName || DELIVERY_REGION_LABEL(order.region));
    return '<div class="order-details"><div class="order-items-list">' + itemsHtml + '</div><div class="order-meta"><div><strong>الاسم:</strong> ' + escapeHtml(order.customerName || '-') + '<br><strong>الهاتف:</strong> ' + escapeHtml(order.customerPhone || '-') + '<br><strong>العنوان:</strong> ' + escapeHtml(order.address || '-') + '</div><div><strong>طريقة التوصيل:</strong> ' + (order.delivery === 'pickup' ? 'استلام ذاتي' : 'توصيل') + '<br><strong>الموقع:</strong> ' + escapeHtml(destination) + '<br><strong>المجموع الفرعي:</strong> ' + escapeHtml(formatCurrency(order.subtotal)) + '<br><strong>التوصيل:</strong> ' + escapeHtml(formatCurrency(order.deliveryCost || 0)) + '<br><strong>الإجمالي:</strong> ' + escapeHtml(formatCurrency(order.total)) + '</div></div>' + (order.notes ? '<div class="order-item-card"><strong>ملاحظات:</strong><div>' + escapeHtml(order.notes) + '</div></div>' : '') + '</div>';
}

function toggleOrderDetails(orderId) {
    var row = document.querySelector('[data-order-details="' + CSS.escape(String(orderId)) + '"]');
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

async function updateOrderStatus(orderId, status) {
    setAdminLoading(true);
    await db.collection('orders').doc(String(orderId)).update({ status: status });
    setAdminLoading(false);
    setAdminStatus('تم تحديث حالة الطلب.', 'success');
}

function ORDER_STATUS_LABEL(status) {
    return { new: 'جديد', processing: 'قيد المعالجة', completed: 'مكتمل', cancelled: 'ملغي' }[status] || status;
}

function DELIVERY_REGION_LABEL(region) {
    return { pickup: 'استلام', westbank: 'الضفة', jerusalem: 'القدس', inside: 'الداخل' }[region] || '-';
}

function renderDashboard() {
    var completedOrders = orders.filter(function (order) { return order.status === 'completed'; });
    var totalRevenue = completedOrders.reduce(function (sum, order) { return sum + (Number(order.total) || 0); }, 0);
    var totalOrders = orders.length;
    var pendingOrders = orders.filter(function (order) { return order.status === 'new' || order.status === 'processing'; }).length;
    var completedCount = completedOrders.length;
    var weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    var monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - 1);
    var ordersWeek = orders.filter(function (order) { return new Date(order.date) >= weekStart; }).length;
    var ordersMonth = orders.filter(function (order) { return new Date(order.date) >= monthStart; }).length;

    document.getElementById('statsGrid').innerHTML = [
        statCard('إجمالي الإيراد', formatCurrency(totalRevenue), 'من الطلبات المكتملة'),
        statCard('إجمالي الطلبات', totalOrders, 'كل الحالات'),
        statCard('الطلبات المعلقة', pendingOrders, 'جديد + قيد المعالجة'),
        statCard('الطلبات المكتملة', completedCount, 'مكتملة فقط'),
        statCard('طلبات هذا الأسبوع', ordersWeek, 'آخر 7 أيام'),
        statCard('طلبات هذا الشهر', ordersMonth, 'آخر 30 يوم'),
        statCard('عدد المنتجات', products.length, 'في المتجر'),
        statCard('عدد الخصومات', discounts.length, 'الخصومات النشطة')
    ].join('');

    renderRevenueChart();
    renderStatusChart();
    renderRegionChart();
    renderTopProductsChart();
}

function statCard(title, value, subtitle) {
    return '<div class="stat-card"><h4>' + title + '</h4><strong>' + value + '</strong><span>' + subtitle + '</span></div>';
}

function destroyChart(key) {
    if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
    }
}

function renderRevenueChart() {
    var labels = [];
    var values = [];
    for (var index = 29; index >= 0; index -= 1) {
        var day = new Date();
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - index);
        var nextDay = new Date(day);
        nextDay.setDate(day.getDate() + 1);
        labels.push(day.toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' }));
        values.push(orders.filter(function (order) {
            var orderDate = new Date(order.date);
            return order.status === 'completed' && orderDate >= day && orderDate < nextDay;
        }).reduce(function (sum, order) { return sum + (Number(order.total) || 0); }, 0));
    }

    destroyChart('revenue');
    charts.revenue = new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'الإيراد', data: values, borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.18)', fill: true, tension: 0.35 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderStatusChart() {
    var statuses = ['new', 'processing', 'completed', 'cancelled'];
    destroyChart('status');
    charts.status = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: {
            labels: statuses.map(ORDER_STATUS_LABEL),
            datasets: [{ data: statuses.map(function (status) { return orders.filter(function (order) { return order.status === status; }).length; }), backgroundColor: ['#60a5fa', '#fbbf24', '#34d399', '#f87171'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderRegionChart() {
    var regions = ['pickup', 'westbank', 'jerusalem', 'inside'];
    destroyChart('region');
    charts.region = new Chart(document.getElementById('regionChart'), {
        type: 'pie',
        data: {
            labels: regions.map(DELIVERY_REGION_LABEL),
            datasets: [{ data: regions.map(function (region) { return orders.filter(function (order) { return (order.region || 'pickup') === region; }).length; }), backgroundColor: ['#d4af37', '#b8860b', '#c9a96e', '#1a1a1a'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTopProductsChart() {
    var totals = {};
    orders.forEach(function (order) {
        (order.items || []).forEach(function (item) {
            totals[item.name] = (totals[item.name] || 0) + (Number(item.qty) || 0);
        });
    });
    var topProducts = Object.keys(totals).map(function (name) {
        return { name: name, qty: totals[name] };
    }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);

    destroyChart('topProducts');
    charts.topProducts = new Chart(document.getElementById('topProductsChart'), {
        type: 'bar',
        data: {
            labels: topProducts.map(function (item) { return item.name; }),
            datasets: [{ label: 'الكمية', data: topProducts.map(function (item) { return item.qty; }), backgroundColor: '#d4af37' }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });
}

async function seedData(force) {
    var shouldForce = force || confirm('سيتم تعبئة قاعدة البيانات بالمنتجات الافتراضية إذا كانت فارغة. للكتابة فوق البيانات الحالية اختاري موافق.');
    setAdminLoading(true);
    var result = await seedFirestoreData(shouldForce);
    setAdminLoading(false);
    if (result.seeded) setAdminStatus('تم تنفيذ Seed Data بنجاح.', 'success');
    else setAdminStatus('تم تجاهل Seed Data لأن المنتجات موجودة بالفعل.', 'warning');
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Image upload functions
function previewImage(input) {
    var preview = document.getElementById('imagePreview');
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            preview.innerHTML = '<img src="' + e.target.result + '">';
        };
        reader.readAsDataURL(input.files[0]);
        // Clear URL input when file is selected
        document.getElementById('productImage').value = '';
    } else {
        preview.innerHTML = '';
    }
}

async function uploadProductImage(file, productId) {
    // Upload to ImgBB
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                var maxSize = 600;
                var w = img.width;
                var h = img.height;
                if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                var formData = new FormData();
                formData.append('key', 'de10f7f874d9dbf904fe0cd0ad00332d');
                formData.append('image', base64);
                formData.append('name', productId || 'product');
                fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData })
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (data && data.data && data.data.url) {
                            resolve(data.data.url);
                        } else {
                            reject(new Error('ImgBB upload failed'));
                        }
                    })
                    .catch(function (err) { reject(err); });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/* ===== Media helpers: video → GIF, blob → ImgBB, unified product media ===== */
async function uploadProductMedia(file, productId) {
    if (file && file.type && file.type.indexOf('video') === 0) {
        setAdminStatus('جاري تحويل الفيديو إلى صورة متحركة (GIF)...', 'info');
        var gifBlob = await convertVideoToGif(file, function (p) { setAdminStatus('تحويل الفيديو: ' + p + '%', 'info'); });
        setAdminStatus('جاري رفع الصورة المتحركة...', 'info');
        return await uploadBlobToImgbb(gifBlob, (productId || 'product') + '_gif');
    }
    return await uploadProductImage(file, productId);
}

function uploadBlobToImgbb(blob, name) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var base64 = String(e.target.result).split(',')[1];
            var formData = new FormData();
            formData.append('key', 'de10f7f874d9dbf904fe0cd0ad00332d');
            formData.append('image', base64);
            formData.append('name', name || 'media');
            fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data && data.data && data.data.url) resolve(data.data.url);
                    else reject(new Error('ImgBB upload failed'));
                })
                .catch(reject);
        };
        reader.onerror = function () { reject(new Error('تعذر قراءة الملف')); };
        reader.readAsDataURL(blob);
    });
}

// Convert any uploaded video (including big files) to a lightweight animated GIF.
// Big videos are handled by capping duration (6s), downscaling (max 480px) and frame count (48).
function convertVideoToGif(file, onProgress) {
    return new Promise(function (resolve, reject) {
        if (typeof GIF === 'undefined') { reject(new Error('مكتبة GIF غير محمّلة')); return; }
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;
        video.src = url;
        video.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الفيديو')); };
        video.onloadedmetadata = function () {
            var maxW = 480;
            var vw = video.videoWidth || 480;
            var vh = video.videoHeight || 640;
            var scale = Math.min(1, maxW / vw);
            var w = Math.max(2, Math.round(vw * scale));
            var h = Math.max(2, Math.round(vh * scale));
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d');
            var duration = video.duration;
            if (!isFinite(duration) || duration <= 0) duration = 4;
            duration = Math.min(duration, 6);
            var fps = 8;
            var frameCount = Math.max(4, Math.min(Math.floor(duration * fps), 48));
            var interval = duration / frameCount;
            var gif = new GIF({
                workers: 2,
                quality: 12,
                width: w,
                height: h,
                repeat: 0,
                workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
            });
            gif.on('progress', function (p) { if (onProgress) onProgress(Math.round(50 + p * 50)); });
            gif.on('finished', function (blob) { URL.revokeObjectURL(url); resolve(blob); });
            var i = 0;
            function capture() {
                if (i >= frameCount) { gif.render(); return; }
                try { video.currentTime = i * interval; } catch (e) { gif.render(); }
            }
            video.onseeked = function () {
                try {
                    ctx.drawImage(video, 0, 0, w, h);
                    gif.addFrame(ctx, { copy: true, delay: Math.round(interval * 1000) });
                } catch (e) { /* skip frame */ }
                i++;
                if (onProgress) onProgress(Math.round((i / frameCount) * 50));
                capture();
            };
            capture();
        };
    });
}

/* ===== Hero (front banner) management ===== */
function renderHeroTable() {
    var body = document.getElementById('heroTableBody');
    if (!body) return;
    if (!heroSlides.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:18px;">لا توجد صور واجهة بعد. أضيفي صورة أو فيديو ليظهر في أعلى المتجر.</td></tr>';
        return;
    }
    body.innerHTML = heroSlides.map(function (slide) {
        var preview = slide.type === 'video'
            ? '<video src="' + slide.url + '" muted style="width:74px;height:54px;object-fit:cover;border-radius:6px;"></video>'
            : '<img src="' + slide.url + '" style="width:74px;height:54px;object-fit:cover;border-radius:6px;">';
        return '<tr><td>' + preview + '</td><td>' + (slide.type === 'video' ? 'فيديو' : 'صورة') + '</td><td>' + (slide.title || '-') + '</td><td>' + (slide.order != null ? slide.order : 0) + '</td><td><button class="btn-danger" style="padding:6px 14px;font-size:13px;" onclick="deleteHeroSlide(\'' + slide.id + '\')">حذف</button></td></tr>';
    }).join('');
}

async function saveHeroSlide(event) {
    event.preventDefault();
    var fileInput = document.getElementById('heroFile');
    var url = document.getElementById('heroUrl').value.trim();
    var title = document.getElementById('heroTitle').value.trim();
    var order = parseInt(document.getElementById('heroOrder').value || '0', 10) || 0;
    var type = 'image';
    var btn = document.getElementById('heroSaveBtn');
    var statusEl = document.getElementById('heroUploadStatus');
    try {
        btn.disabled = true;
        if (fileInput.files && fileInput.files[0]) {
            var file = fileInput.files[0];
            var allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (allowedTypes.indexOf(file.type) < 0) throw new Error('الصورة يجب أن تكون JPG أو PNG أو WebP.');
            if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5MB.');
            statusEl.textContent = 'جاري رفع الصورة...';
            url = await uploadProductImage(file, 'hero_' + Date.now());
        } else if (url) {
            if (!/^https:\/\//i.test(url)) throw new Error('استخدمي رابط HTTPS مباشر للصورة.');
        } else {
            alert('اختاري ملفاً من جهازك أو أدخلي رابطاً.');
            btn.disabled = false;
            return;
        }
        var id = 'hero_' + Date.now();
        await db.collection('heroDisplay').doc(id).set({ url: url, type: type, title: title, order: order });
        statusEl.textContent = 'تمت الإضافة بنجاح ✓';
        fileInput.value = '';
        document.getElementById('heroUrl').value = '';
        document.getElementById('heroTitle').value = '';
        setTimeout(function () { statusEl.textContent = ''; }, 2500);
    } catch (e) {
        console.error(e);
        statusEl.textContent = '';
        alert('حدث خطأ: ' + (e && e.message ? e.message : e));
    } finally {
        btn.disabled = false;
    }
}

async function deleteHeroSlide(id) {
    if (!confirm('حذف هذه الصورة من واجهة المتجر؟')) return;
    await db.collection('heroDisplay').doc(String(id)).delete();
}