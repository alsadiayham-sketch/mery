var FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27400%27 height=%27400%27 viewBox=%270 0 400 400%27%3E%3Crect width=%27400%27 height=%27400%27 fill=%27%23fff8cf%27/%3E%3Ccircle cx=%27200%27 cy=%27165%27 r=%2765%27 fill=%27%23f05f91%27 opacity=%27.18%27/%3E%3Ctext x=%27200%27 y=%27275%27 text-anchor=%27middle%27 font-family=%27Arial%27 font-size=%2732%27 fill=%27%23dc4c7f%27%3EMery Beauty%3C/text%3E%3C/svg%3E";

var products = [];
var discounts = [];
var siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
var currentFilter = 'all';
var cart = normalizeCartItems(JSON.parse(localStorage.getItem('mery_cart') || '[]'), normalizeProducts(DEFAULT_PRODUCTS));
var deliveryMethod = localStorage.getItem('mery_delivery_method') || 'delivery';
var currentPDPProduct = null;
var currentPDPSizeIdx = 0;
var pdpQty = 1;
var usedFallbackData = false;
var unsubscribers = [];
var storeLoadState = {
    products: false,
    discounts: false,
    settings: false
};

document.addEventListener('DOMContentLoaded', function () {
    saveCart();
    renderBrands();
    setupSearch('navSearchInput', 'navSearchDropdown');
    setupSearch('productsSearchInput', 'productsSearchDropdown');
initializeOrderTracking();
    updateCartBadge();
    updateCheckoutLink(cart.length ? updateCartTotal() : 0);
    setDeliveryMethod(deliveryMethod);
    setLoadingState(true);
    subscribeToStoreData();
    // Fallback if the store API takes too long.
    setTimeout(function () {
        if (!storeLoadState.products || !storeLoadState.discounts || !storeLoadState.settings) {
            // Only apply fallback if we truly have no data yet
            if (products.length === 0) {
                applyFallbackStoreData('');
            } else {
                // Products loaded but discounts/settings didn't - force render anyway
                storeLoadState.products = true;
                storeLoadState.discounts = true;
                storeLoadState.settings = true;
                setLoadingState(false);
                renderStorefront();
            }
        }
    }, 10000);
});

function setLoadingState(isLoading) {
    var loading = document.getElementById('storeLoading');
    var grid = document.getElementById('productsGrid');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
    if (grid) grid.classList.toggle('is-loading', !!isLoading);
}

function setStoreMessage(message, type) {
    var notice = document.getElementById('storeNotice');
    if (!notice) return;
    if (!message) {
        notice.style.display = 'none';
        notice.textContent = '';
        notice.className = 'store-notice';
        return;
    }
    notice.textContent = message;
    notice.className = 'store-notice ' + (type || 'info');
    notice.style.display = 'block';
}

function markStoreLoaded(key) {
    storeLoadState[key] = true;
    if (storeLoadState.products && storeLoadState.discounts && storeLoadState.settings) {
        setLoadingState(false);
        renderStorefront();
    }
}

function subscribeToStoreData() {
    if (!window.db) {
        applyFallbackStoreData('تعذر الاتصال بقاعدة بيانات المتجر.');
        return;
    }

    unsubscribers.forEach(function (unsubscribe) {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    unsubscribers = [];

    // Load first 6 products fast, then load the rest
    db.collection('products').orderBy('id').limit(6).get().then(function (snapshot) {
        if (!snapshot.empty) {
            products = snapshot.docs.map(function (docSnap) {
                var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d);
            });
            syncCartWithProducts();
            markStoreLoaded('products');
        }
    }).catch(function () {
        // Initial fetch failed, rely on onSnapshot below
    });

    // Subscribe to all products for real-time updates (always runs)
    unsubscribers.push(db.collection('products').onSnapshot(function (fullSnapshot) {
        products = fullSnapshot.docs.map(function (docSnap) {
            var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d);
        }).sort(function (a, b) { return a.id - b.id; });
        syncCartWithProducts();
        markStoreLoaded('products');
    }, function () {
        if (!storeLoadState.products) applyFallbackStoreData('تعذر تحميل المنتجات حالياً.');
        else setStoreMessage('تعذر تحديث المنتجات حالياً.', 'error');
    }));

    unsubscribers.push(db.collection('discounts').onSnapshot(function (snapshot) {
        discounts = snapshot.docs.map(function (docSnap) {
            return normalizeDiscount(docSnap.data());
        });
        markStoreLoaded('discounts');
    }, function () {
        discounts = normalizeDiscounts(DEFAULT_DISCOUNTS);
        markStoreLoaded('discounts');
        setStoreMessage('تعذر تحميل الخصومات الحالية.', 'warning');
    }));

    unsubscribers.push(db.collection('settings').doc('config').onSnapshot(function (docSnap) {
        siteSettings = normalizeSettings(docSnap.exists ? docSnap.data() : DEFAULT_SITE_SETTINGS);
        markStoreLoaded('settings');
    }, function () {
        siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
        markStoreLoaded('settings');
        setStoreMessage('تعذر تحميل إعدادات المتجر الحالية.', 'warning');
    }));

    // Hero Display slider
    unsubscribers.push(db.collection('heroDisplay').orderBy('order', 'asc').onSnapshot(function (snapshot) {
        var slides = snapshot.docs.map(function(doc) { return doc.data(); });
        renderHeroSlider(slides);
    }, function() { /* keep static fallback */ }));
}

function applyFallbackStoreData(message) {
    usedFallbackData = true;
    products = normalizeProducts(DEFAULT_PRODUCTS);
    discounts = normalizeDiscounts(DEFAULT_DISCOUNTS);
    siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
    storeLoadState.products = true;
    storeLoadState.discounts = true;
    storeLoadState.settings = true;
    syncCartWithProducts();
    setStoreMessage(message, 'warning');
    setLoadingState(false);
    renderStorefront();
}

function syncCartWithProducts() {
    cart = normalizeCartItems(cart, products);
    saveCart();
}

function renderStorefront() {
    applySettings();
    renderFilters();
    checkDiscountBanner();
    updateCartBadge();
    renderProducts(getFilteredProducts(currentFilter));
    updateCheckoutLink(updateCartTotal());
    if (!usedFallbackData) setStoreMessage('', 'info');
}

function applySettings() {
    document.querySelectorAll('.hero-title').forEach(function (heroTitle) {
        heroTitle.textContent = siteSettings.heroTitle;
    });
    document.querySelectorAll('.hero-subtitle').forEach(function (heroSub) {
        heroSub.textContent = siteSettings.heroSubtitle;
    });

    var aboutText = document.getElementById('aboutText');
    if (aboutText) aboutText.innerHTML = siteSettings.aboutText.replace(/\n/g, '<br>');

    var whatsappLink = document.getElementById('whatsappLink');
    if (whatsappLink) whatsappLink.href = buildWhatsAppUrl(siteSettings.whatsappNumber);

    var instagramLink = document.getElementById('instagramLink');
    if (instagramLink) instagramLink.href = siteSettings.instagramLink;

    var tiktokLink = document.getElementById('tiktokLink');
    if (tiktokLink) {
        if (siteSettings.tiktokLink) {
            tiktokLink.href = siteSettings.tiktokLink;
            tiktokLink.style.display = 'flex';
        } else {
            tiktokLink.style.display = 'none';
        }
    }
}

function checkDiscountBanner() {
    var banner = document.getElementById('discountBanner');
    var textNode = document.getElementById('bannerText');
    if (!banner || !textNode) return;

    var now = new Date().toISOString().slice(0, 10);
    var activeDiscounts = discounts.filter(function (discount) {
        if (!discount.description) return false;
        if (discount.expiresAt && discount.expiresAt < now) return false;
        return true;
    });

    if (activeDiscounts.length) {
        document.body.classList.add('has-banner');
        banner.style.display = 'block';
        var text = activeDiscounts.map(function (discount) {
            return discount.description;
        }).join('     |     ');
        textNode.textContent = text + '     |     ' + text;
    } else {
        document.body.classList.remove('has-banner');
        banner.style.display = 'none';
        textNode.textContent = '';
    }
}

function getFilteredProducts(filter) {
    if (filter === 'discounts') {
        return products.filter(function (product) {
            return getProductDiscountPercent(product, discounts) > 0;
        });
    }

    if (filter === 'packages') {
        return products.filter(function (product) {
            var category = String(product.category || '').toLowerCase();
            var name = String(product.name || '').toLowerCase();
            return category.indexOf('بكج') >= 0 ||
                category.indexOf('باكج') >= 0 ||
                category.indexOf('package') >= 0 ||
                name.indexOf('بكج') >= 0 ||
                name.indexOf('باكج') >= 0 ||
                name.indexOf('set') >= 0;
        });
    }

    if (filter !== 'all') {
        return products.filter(function (product) {
            return product.category === filter || product.brand === filter;
        });
    }

    return products.slice();
}

function getPriceHTML(pricing) {
    return (pricing.hasDiscount ? '<s class="original-price"><span class="sr-only">السعر قبل الخصم: </span>' + formatCurrency(pricing.original) + '</s>' : '') +
        '<span><span class="sr-only">' + (pricing.hasDiscount ? 'السعر الآن: ' : 'السعر: ') + '</span>' + formatCurrency(pricing.final) + '</span>';
}

var visibleProductCount = 8;
var renderedProductSignature = '';
var productsObserver = null;

function renderProducts(productsToShow) {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;
    var signature = currentFilter + ':' + productsToShow.map(function (product) { return product.id; }).join(',');
    if (signature !== renderedProductSignature) {
        renderedProductSignature = signature;
        visibleProductCount = 8;
    }
    grid.innerHTML = '';

    if (!productsToShow.length) {
        grid.innerHTML = '<div class="empty-products">لا توجد منتجات متاحة حالياً.</div>';
        return;
    }

    productsToShow.slice(0, visibleProductCount).forEach(function (product) {
        var sizeData = getSizeData(product, 0);
        var pricing = getFinalPrice(product, 0, discounts);
        var statusBadge = getStatusBadge(product.status);
        var discountBadge = pricing.hasDiscount ? '<span class="discount-badge">-' + pricing.discountPercent + '%</span>' : '';
        var soldOutClass = product.status === 'soldout' ? 'sold-out' : '';
        var usableSizes = product.sizes.filter(function (size) { return Boolean(getSizeLabel(size)); });
        var sizeLabel = getSizeLabel(sizeData);
        var sizeSelector = usableSizes.length > 1
            ? '<div class="card-size-selector"><label for="sizeSelect-' + product.id + '">الحجم:</label><select id="sizeSelect-' + product.id + '" class="size-select" onclick="event.stopPropagation()" onchange="updateProductSize(\'' + product.id + '\', this.value)">' + product.sizes.map(function (size, idx) { return '<option value="' + idx + '">' + getSizeLabel(size) + '</option>'; }).join('') + '</select></div>'
            : (sizeLabel ? '<div class="card-size-single"><span>الحجم:</span><strong>' + sizeLabel + '</strong></div>' : '');
        var sizeMeta = sizeLabel ? '<span class="product-size" id="productSize-' + product.id + '">' + sizeLabel + '</span>' : '';

        var card = document.createElement('div');
        card.className = 'product-card ' + soldOutClass;
        card.dataset.productId = String(product.id);
        card.innerHTML = [
            discountBadge,
            statusBadge,
            '<div class="product-image" onclick="openPDP(\'' + product.id + '\')" style="cursor:pointer;">',
            '<img src="' + product.image + '" alt="' + product.name + '" loading="lazy" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">',
            '<button class="btn-share-product product-share-button" type="button" onclick="shareProduct(event, \'' + product.id + '\')" aria-label="مشاركة ' + product.name + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.5 6.8-4"></path><path d="m8.6 13.5 6.8 4"></path></svg></button>',
            '</div>',
            '<div class="product-info" onclick="openPDP(\'' + product.id + '\')" style="cursor:pointer;">',
            '<span class="product-brand">' + product.brand + '</span>',
            '<h3>' + product.name + '</h3>',
            '<div class="product-meta"><span>' + product.category + '</span>' + sizeMeta + '</div>',
            '<div class="product-price" id="productPrice-' + product.id + '">' + getPriceHTML(pricing) + '</div>',
            '</div>',
            '<div class="product-card-controls">' + sizeSelector + '</div>',
            '<div class="product-card-actions">',
            '<div class="qty-selector qty-sm" id="qty-' + product.id + '"><button type="button" id="cardQtyMinus-' + product.id + '" aria-label="تقليل الكمية" onclick="event.stopPropagation(); changeCardQty(\'' + product.id + '\', -1)">−</button><input id="cardQty-' + product.id + '" type="number" min="1" max="' + product.stock + '" value="1" inputmode="numeric" aria-label="كمية ' + product.name + '" onclick="event.stopPropagation()" onchange="setCardQty(\'' + product.id + '\', this.value)"><button type="button" id="cardQtyPlus-' + product.id + '" aria-label="زيادة الكمية" onclick="event.stopPropagation(); changeCardQty(\'' + product.id + '\', 1)">+</button></div>',
            '<button class="btn-add-cart" id="cardAdd-' + product.id + '" onclick="addToCart(event, \'' + product.id + '\')" ' + (product.status === 'soldout' || product.stock < 1 ? 'disabled' : '') + '>' + (product.status === 'soldout' || product.stock < 1 ? 'نفذت الكمية' : 'أضيفي') + '</button>',
            '</div>'
        ].join('');
        grid.appendChild(card);
        updateCardQtyControl(product.id);
    });
    if (productsObserver) productsObserver.disconnect();
    if (productsToShow.length > visibleProductCount) {
        var sentinel = document.createElement('button');
        sentinel.type = 'button';
        sentinel.className = 'products-load-more';
        sentinel.textContent = 'تحميل المزيد';
        sentinel.onclick = loadMoreProducts;
        grid.appendChild(sentinel);
        if ('IntersectionObserver' in window) {
            productsObserver = new IntersectionObserver(function (entries) {
                if (entries[0].isIntersecting) loadMoreProducts();
            }, { rootMargin: '320px' });
            productsObserver.observe(sentinel);
        }
    }
    var sharedProductId = new URLSearchParams(window.location.search).get('product');
    if (sharedProductId && !currentPDPProduct && products.some(function (product) { return product.id === sharedProductId; })) {
        openPDP(sharedProductId);
    }
}

function loadMoreProducts() {
    visibleProductCount += 8;
    renderProducts(getFilteredProducts(currentFilter));
}

function shareProduct(event, productId) {
    event.stopPropagation();
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;
    var url = window.location.origin + window.location.pathname + '?product=' + encodeURIComponent(productId);
    var button = event.currentTarget;

    function showCopied() {
        if (button) {
            button.classList.add('is-copied');
            button.setAttribute('aria-label', 'تم نسخ الرابط');
            setTimeout(function () {
                button.classList.remove('is-copied');
                button.setAttribute('aria-label', 'مشاركة المنتج');
            }, 1800);
        }
        setStoreMessage('تم نسخ رابط المنتج.', 'success');
    }

    function copyLink() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(url).then(showCopied).catch(legacyCopy);
        }
        return legacyCopy();
    }

    function legacyCopy() {
        var input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        var copied = document.execCommand('copy');
        document.body.removeChild(input);
        if (copied) showCopied();
        else window.prompt('انسخي رابط المنتج:', url);
    }

    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        navigator.share({ title: product.name, text: product.name, url: url }).catch(function (error) {
            if (!error || error.name !== 'AbortError') copyLink();
        });
    } else {
        copyLink();
    }
}

function shareCurrentProduct() {
    if (!currentPDPProduct) return;
    shareProduct({ stopPropagation: function () {}, currentTarget: document.querySelector('#pdpModal .btn-share-product') }, currentPDPProduct.id);
}

function updateProductSize(productId, sizeIdx) {
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;
    var sizeData = getSizeData(product, sizeIdx);
    var pricing = getFinalPrice(product, sizeIdx, discounts);
    var sizeEl = document.getElementById('productSize-' + productId);
    var priceEl = document.getElementById('productPrice-' + productId);
    if (sizeEl) sizeEl.textContent = getSizeLabel(sizeData);
    if (priceEl) priceEl.innerHTML = getPriceHTML(pricing);
}

function getStatusBadge(status) {
    switch (status) {
        case 'bestseller': return '<span class="status-badge bestseller">الأكثر مبيعاً</span>';
        case 'special': return '<span class="status-badge special">مميز</span>';
        case 'soldout': return '<span class="status-badge soldout">نفذت الكمية</span>';
        default: return '';
    }
}

function filterProducts(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(function (button) {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
    });
    var activeBtn = document.querySelector('[data-filter="' + filter + '"]');
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-pressed', 'true');
    }
    renderProducts(getFilteredProducts(filter));
}

function toggleFilters() {
    var panel = document.getElementById('filterPanel');
    var btn = document.querySelector('.filter-toggle-btn');
    if (!panel || !btn) return;
    var isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'فلتر ▲' : 'فلتر ▼';
}

function createFilterButton(value) {
    var button = document.createElement('button');
    button.className = 'filter-btn';
    button.dataset.filter = value;
    button.textContent = value;
    button.addEventListener('click', function () {
        filterProducts(value);
    });
    return button;
}

function renderFilters() {
    return;
}

function renderBrands() {
    var grid = document.getElementById('brandsGrid');
    if (!grid) return;
    grid.innerHTML = BRANDS_DATA.map(function (brand) {
        return '<img src="' + brand.logo + '" alt="' + brand.name + '" class="brand-logo" title="' + brand.name + '" onerror="this.style.display=\'none\'">';
    }).join('');
}

function setupSearch(inputId, dropdownId) {
    var input = document.getElementById(inputId);
    var dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.addEventListener('input', function () {
        var query = this.value.trim();
        if (query.length < 2) {
            dropdown.classList.remove('active');
            return;
        }

        var results = products.filter(function (product) {
            return product.name.indexOf(query) >= 0 || product.category.indexOf(query) >= 0 || product.brand.toLowerCase().indexOf(query.toLowerCase()) >= 0;
        }).slice(0, 8);

        if (!results.length) {
            dropdown.innerHTML = '<div class="search-item"><div class="search-item-info"><h4>لا توجد نتائج</h4></div></div>';
        } else {
            dropdown.innerHTML = results.map(function (product) {
                var pricing = getFinalPrice(product, 0, discounts);
                return '<div class="search-item" onclick="scrollToProduct(\'' + product.id + '\')"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"><div class="search-item-info"><h4>' + product.name + '</h4><span>' + product.brand + ' • ' + product.category + ' • ' + getSizeLabel(getSizeData(product, 0)) + ' • ' + formatCurrency(pricing.final) + '</span></div></div>';
            }).join('');
        }
        dropdown.classList.add('active');
    });

    document.addEventListener('click', function (event) {
        if (!input.contains(event.target) && !dropdown.contains(event.target)) dropdown.classList.remove('active');
    });
}

function scrollToProduct(productId) {
    filterProducts('all');
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.search-dropdown').forEach(function (dropdown) { dropdown.classList.remove('active'); });
    document.querySelectorAll('.nav-search input, .products-search input').forEach(function (input) { input.value = ''; });
    setTimeout(function () {
        var card = document.querySelector('.product-card[data-product-id="' + productId + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
}

function toggleMobileMenu() {
    var menu = document.getElementById('mobileMenu');
    var button = document.querySelector('.mobile-menu-btn');
    if (!menu) return;
    var isOpen = menu.classList.toggle('active');
    if (button) {
        button.setAttribute('aria-expanded', String(isOpen));
        button.setAttribute('aria-label', isOpen ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل');
    }
}

document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (event) {
        event.preventDefault();
        var target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

window.addEventListener('scroll', function () {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.style.boxShadow = window.scrollY > 50 ? '0 4px 20px rgba(0,0,0,0.1)' : '0 2px 10px rgba(0,0,0,0.05)';
});


function createDefaultPackagingSet() {
    return {
        chocolateType: 'mixed',
        filling: 'plain',
        qty: 1
    };
}

function getPackagingTypeLabel(value) {
    switch (value) {
        case 'dark': return 'داكن';
        case 'milk': return 'حليب';
        case 'white': return 'أبيض';
        default: return 'مشكل';
    }
}

function getPackagingFillingLabel(value) {
    switch (value) {
        case 'plain': return 'سادا / بدون حشوة';
        case 'hazelnut': return 'بندق';
        case 'caramel': return 'كراميل';
        case 'pistachio': return 'فستق';
        case 'coconut': return 'جوز الهند';
        case 'strawberry': return 'فراولة';
        case 'orange': return 'برتقال';
        default: return 'سادا / بدون حشوة';
    }
}

function getWrapperColorLabel(value) {
    switch (value) {
        case 'gold': return 'ذهبي';
        case 'silver': return 'فضي';
        case 'red': return 'أحمر';
        case 'pink': return 'زهري';
        case 'purple': return 'بنفسجي';
        case 'black': return 'أسود';
        case 'white': return 'أبيض';
        case 'blue': return 'أزرق';
        default: return 'ذهبي';
    }
}

function buildPackagingOptions(options, selectedValue) {
    return options.map(function (option) {
        return '<option value="' + option.value + '"' + (selectedValue === option.value ? ' selected' : '') + '>' + option.label + '</option>';
    }).join('');
}

function renderPackagingSets() {
    var container = document.getElementById('packagingSetsContainer');
    if (!container) return;
    var typeOptions = [
        { value: 'dark', label: 'داكن' },
        { value: 'milk', label: 'حليب' },
        { value: 'white', label: 'أبيض' },
        { value: 'mixed', label: 'مشكل' }
    ];
    var fillingOptions = [
        { value: 'plain', label: 'سادا / بدون حشوة' },
        { value: 'hazelnut', label: 'بندق' },
        { value: 'caramel', label: 'كراميل' },
        { value: 'pistachio', label: 'فستق' },
        { value: 'coconut', label: 'جوز الهند' },
        { value: 'strawberry', label: 'فراولة' },
        { value: 'orange', label: 'برتقال' }
    ];
    container.innerHTML = packagingBuilderSets.map(function (setItem, index) {
        return '<div class="builder-set">'
            + '<div class="builder-set-head"><h5>تشكيلة ' + (index + 1) + '</h5>'
            + (packagingBuilderSets.length > 1 ? '<button type="button" class="builder-remove-set" onclick="removePackagingSet(' + index + ')">حذف</button>' : '')
            + '</div>'
            + '<div class="builder-set-grid">'
            + '<div class="builder-field"><label>نوع الشوكولاتة</label><select onchange="updatePackagingSetField(' + index + ', \'chocolateType\', this.value)">' + buildPackagingOptions(typeOptions, setItem.chocolateType) + '</select></div>'
            + '<div class="builder-field"><label>الحشوة</label><select onchange="updatePackagingSetField(' + index + ', \'filling\', this.value)">' + buildPackagingOptions(fillingOptions, setItem.filling) + '</select></div>'
            + '<div class="builder-field"><label>الكمية</label><input type="number" min="1" value="' + (parseInt(setItem.qty, 10) || 1) + '" onchange="updatePackagingSetField(' + index + ', \'qty\', this.value)"></div>'
            + '</div></div>';
    }).join('');
}

function updatePackagingSetField(index, field, value) {
    if (!packagingBuilderSets[index]) return;
    if (field === 'qty') packagingBuilderSets[index][field] = Math.max(1, parseInt(value, 10) || 1);
    else packagingBuilderSets[index][field] = value;
}

function addPackagingSet(prefill) {
    packagingBuilderSets.push(normalizeCustomPackageSet(prefill || createDefaultPackagingSet()));
    renderPackagingSets();
}

function removePackagingSet(index) {
    if (packagingBuilderSets.length <= 1) packagingBuilderSets = [createDefaultPackagingSet()];
    else packagingBuilderSets.splice(index, 1);
    renderPackagingSets();
}

function togglePackagingDeliveryFields() {
    var selected = document.querySelector('input[name="packageDelivery"]:checked');
    var locationField = document.getElementById('packageLocationField');
    if (locationField) locationField.style.display = selected && selected.value === 'delivery' ? 'flex' : 'none';
}

function resetPackagingBuilderForm() {
    editingCustomPackageId = '';
    packagingBuilderSets = [createDefaultPackagingSet()];
    var title = document.getElementById('packagingBuilderTitle');
    var submit = document.getElementById('packagingBuilderSubmit');
    if (title) title.textContent = 'صممي علبتك المخصصة';
    if (submit) submit.textContent = 'أضيفي إلى السلة';
    if (document.getElementById('packageWrapperColor')) document.getElementById('packageWrapperColor').value = 'gold';
    if (document.getElementById('packageNotes')) document.getElementById('packageNotes').value = '';
    if (document.getElementById('packageCustomerName')) document.getElementById('packageCustomerName').value = '';
    if (document.getElementById('packageCustomerPhone')) document.getElementById('packageCustomerPhone').value = '';
    if (document.getElementById('packageCustomerLocation')) document.getElementById('packageCustomerLocation').value = '';
    document.querySelectorAll('input[name="packageDelivery"]').forEach(function (input) {
        input.checked = input.value === 'delivery';
    });
    renderPackagingSets();
    togglePackagingDeliveryFields();
}

function populatePackagingBuilder(item) {
    var normalized = normalizeCustomPackageItem(item);
    editingCustomPackageId = normalized.id;
    packagingBuilderSets = normalized.sets.map(function (setItem) { return normalizeCustomPackageSet(setItem); });
    if (document.getElementById('packagingBuilderTitle')) document.getElementById('packagingBuilderTitle').textContent = 'تعديل العلبة المخصصة';
    if (document.getElementById('packagingBuilderSubmit')) document.getElementById('packagingBuilderSubmit').textContent = 'حفظ التعديلات';
    renderPackagingSets();
    document.getElementById('packageWrapperColor').value = normalized.wrapperColor;
    document.getElementById('packageNotes').value = normalized.notes;
    document.getElementById('packageCustomerName').value = normalized.customerName;
    document.getElementById('packageCustomerPhone').value = normalized.customerPhone;
    document.getElementById('packageCustomerLocation').value = normalized.customerLocation || '';
    document.querySelectorAll('input[name="packageDelivery"]').forEach(function (input) {
        input.checked = input.value === normalized.delivery;
    });
    togglePackagingDeliveryFields();
}

function openPackagingBuilder(itemId) {
    var modal = document.getElementById('packagingBuilderModal');
    if (!modal) return;
    if (itemId) {
        var item = cart.find(function (entry) { return entry.type === 'custom_package' && entry.id === itemId; });
        if (!item) return;
        populatePackagingBuilder(item);
    } else {
        resetPackagingBuilderForm();
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePackagingBuilder(event) {
    if (event && event.target !== event.currentTarget) return;
    var modal = document.getElementById('packagingBuilderModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    resetPackagingBuilderForm();
}

function saveCustomPackageFromBuilder() {
    var selectedDelivery = document.querySelector('input[name="packageDelivery"]:checked');
    var customerName = (document.getElementById('packageCustomerName').value || '').trim();
    var customerPhone = (document.getElementById('packageCustomerPhone').value || '').trim();
    var customerLocation = (document.getElementById('packageCustomerLocation').value || '').trim();
    if (!customerName || !customerPhone) {
        alert('الرجاء إدخال الاسم ورقم الهاتف للعلبة المخصصة');
        return;
    }
    if (selectedDelivery && selectedDelivery.value === 'delivery' && !customerLocation) {
        alert('الرجاء إدخال موقع التوصيل للعلبة المخصصة');
        return;
    }
    var packageItem = normalizeCustomPackageItem({
        id: editingCustomPackageId || 'pkg_' + Date.now(),
        sets: packagingBuilderSets,
        wrapperColor: document.getElementById('packageWrapperColor').value,
        notes: document.getElementById('packageNotes').value,
        delivery: selectedDelivery ? selectedDelivery.value : 'delivery',
        customerName: customerName,
        customerPhone: customerPhone,
        customerLocation: customerLocation,
        qty: 1
    });
    var existingIndex = cart.findIndex(function (entry) {
        return entry.type === 'custom_package' && entry.id === packageItem.id;
    });
    if (existingIndex >= 0) cart[existingIndex] = packageItem;
    else cart.push(packageItem);
    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    renderCart();
    closePackagingBuilder();
    alert(existingIndex >= 0 ? 'تم تحديث العلبة المخصصة بنجاح' : 'تمت إضافة العلبة المخصصة إلى السلة');
}

function editCustomPackage(itemId) {
    if (document.getElementById('cartSidebar').classList.contains('active')) toggleCart();
    setTimeout(function () {
        openPackagingBuilder(itemId);
    }, 180);
}

function getCustomPackageSetsHtml(sets) {
    return (Array.isArray(sets) ? sets : []).map(function (setItem, index) {
        return '<span class="custom-package-set-line">تشكيلة ' + (index + 1) + ': ' + getPackagingTypeLabel(setItem.chocolateType) + ' • ' + getPackagingFillingLabel(setItem.filling) + ' • الكمية ' + (parseInt(setItem.qty, 10) || 1) + '</span>';
    }).join('');
}

function getCustomPackageDeliveryLabel(item) {
    return item.delivery === 'pickup' ? 'استلام من المصنع' : 'توصيل';
}

function renderCustomPackageCartItem(item) {
    var customerParts = ['<span class="custom-package-meta">لون التغليف: ' + getWrapperColorLabel(item.wrapperColor) + '</span>'];
    customerParts.push('<span class="custom-package-meta">طريقة الاستلام: ' + getCustomPackageDeliveryLabel(item) + '</span>');
    customerParts.push('<span class="custom-package-meta">الاسم: ' + escapeHtml(item.customerName) + ' • الهاتف: ' + escapeHtml(item.customerPhone) + '</span>');
    if (item.delivery === 'delivery' && item.customerLocation) customerParts.push('<span class="custom-package-meta">الموقع: ' + escapeHtml(item.customerLocation) + '</span>');
    if (item.notes) customerParts.push('<span class="custom-package-note">ملاحظات: ' + escapeHtml(item.notes) + '</span>');
    return '<div class="cart-item custom-package-item">'
        + '<div class="custom-package-icon">🎁</div>'
        + '<div class="cart-item-info"><h4>' + getCustomPackageTitle(item) + '</h4>'
        + '<div class="custom-package-sets">' + getCustomPackageSetsHtml(item.sets) + '</div>'
        + customerParts.join('')
        + '<div class="cart-item-price pending-price">السعر يحدد بعد مراجعة الإدارة</div></div>'
        + '<div class="cart-custom-actions"><button type="button" class="cart-item-edit" onclick="editCustomPackage(\'' + item.id + '\')">تعديل</button><button class="cart-item-remove" onclick="removeFromCart(\'' + item.id + '\', -1)">✕</button></div>'
        + '</div>';
}

function getCartKnownTotal() {
    return cart.reduce(function (sum, item) {
        if (item.type === 'custom_package') return sum;
        var product = products.find(function (entry) { return entry.id === item.id; });
        return product ? sum + getFinalPrice(product, item.sizeIdx, discounts).final * item.qty : sum;
    }, 0);
}

function initializePackagingBuilder() {
    var form = document.getElementById('packagingBuilderForm');
    if (!form) return;
    resetPackagingBuilderForm();
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        saveCustomPackageFromBuilder();
    });
}

function getOrderStatusLabel(status) {
    switch (status) {
        case 'confirmed': return 'تم التأكيد';
        case 'processing': return 'قيد التجهيز';
        case 'completed': return 'مكتمل';
        case 'cancelled': return 'ملغي';
        default: return 'طلب جديد';
    }
}

function renderTrackedOrderItem(item) {
    if (item.type === 'custom_package') {
        return '<div class="tracking-order-item">'
            + '<div class="tracking-order-item-head"><h5>' + getCustomPackageTitle(item) + '</h5><span class="tracking-order-price">السعر يحدد لاحقاً</span></div>'
            + '<span class="tracking-order-extra">لون التغليف: ' + getWrapperColorLabel(item.wrapperColor) + '</span>'
            + '<div class="custom-package-sets">' + getCustomPackageSetsHtml(item.sets) + '</div>'
            + '<span class="tracking-order-extra">طريقة الاستلام: ' + getCustomPackageDeliveryLabel(item) + '</span>'
            + '<span class="tracking-order-extra">الاسم: ' + escapeHtml(item.customerName || '') + ' • الهاتف: ' + escapeHtml(item.customerPhone || '') + '</span>'
            + ((item.delivery === 'delivery' && item.customerLocation) ? '<span class="tracking-order-extra">الموقع: ' + escapeHtml(item.customerLocation) + '</span>' : '')
            + (item.notes ? '<span class="tracking-order-note">ملاحظات: ' + escapeHtml(item.notes) + '</span>' : '')
            + '</div>';
    }
    return '<div class="tracking-order-item">'
        + '<div class="tracking-order-item-head"><h5>' + escapeHtml(item.name) + '</h5><span class="tracking-order-price">' + formatCurrency(item.lineTotal) + '</span></div>'
        + '<span class="tracking-order-details">' + escapeHtml(item.brand || '') + ' • ' + escapeHtml(item.sizeLabel || '') + ' • الكمية ' + (parseInt(item.qty, 10) || 1) + '</span>'
        + '</div>';
}

function renderTrackedOrder(order) {
    var result = document.getElementById('orderTrackingResult');
    if (!result) return;
    result.innerHTML = '<div class="tracking-result-card">'
        + '<div class="tracking-result-head"><div><h4>الطلب ' + escapeHtml(order.id) + '</h4><p>' + formatDateTime(order.date || order.createdAt) + '</p></div><span class="tracking-status">' + getOrderStatusLabel(order.status) + '</span></div>'
        + '<div class="tracking-order-summary"><div class="tracking-order-summary-row"><span>الحالة الحالية</span><strong>' + getOrderStatusLabel(order.status) + '</strong></div></div>'
        + '</div>';
}

function trackOrder() {
    var input = document.getElementById('orderTrackingInput');
    var phoneInput = document.getElementById('orderTrackingPhone');
    var result = document.getElementById('orderTrackingResult');
    if (!input || !phoneInput || !result) return;
    var orderId = (input.value || '').trim();
    var phone = (phoneInput.value || '').trim();
    if (!orderId || !phone) {
        result.innerHTML = '<div class="order-tracking-message error">أدخلي رقم الطلب ورقم الهاتف المستخدم في الطلب.</div>';
        return;
    }
    if (typeof window.getTrackedOrder !== 'function') {
        result.innerHTML = '<div class="order-tracking-message error">تعذر الاتصال بقاعدة البيانات حالياً.</div>';
        return;
    }
    result.innerHTML = '<div class="order-tracking-message">جاري البحث عن الطلب...</div>';
    window.getTrackedOrder(orderId, phone).then(function (order) {
        if (!order) {
            result.innerHTML = '<div class="order-tracking-message error">لم يتم العثور على طلب مطابق.</div>';
            return;
        }
        renderTrackedOrder(order);
    }).catch(function () {
        result.innerHTML = '<div class="order-tracking-message error">تعذر جلب بيانات الطلب حالياً. حاولي مرة أخرى.</div>';
    });
}

function initializeOrderTracking() {
    var input = document.getElementById('orderTrackingInput');
    if (!input) return;
    input.addEventListener('keypress', function (event) {
        if (event.keyCode === 13) {
            event.preventDefault();
            trackOrder();
        }
    });
}

function getSelectedCardSizeIndex(productId) {
    var select = document.getElementById('sizeSelect-' + productId);
    return select ? parseInt(select.value || '0', 10) || 0 : 0;
}

function addToCart(event, productId) {
    event.stopPropagation();
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product || product.status === 'soldout') return;

    var qty = parseInt(document.getElementById('cardQty-' + productId).value, 10) || 1;
    qty = clampQuantity(product, qty);
    if (qty < 1) {
        updateCardQtyControl(productId);
        return;
    }
    var sizeIdx = getSelectedCardSizeIndex(productId);
    var pricing = getFinalPrice(product, sizeIdx, discounts);
    var btn = event.currentTarget;
    var img = btn.closest('.product-card').querySelector('.product-image img');
    flyToCart(img, product);

    var existing = cart.find(function (item) { return item.id === productId && item.sizeIdx === sizeIdx; });
    if (existing) existing.qty += qty;
    else cart.push({ id: productId, sizeIdx: sizeIdx, qty: qty, price: pricing.final, name: product.name, brand: product.brand, image: product.image });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());

    btn.textContent = 'تمت الإضافة';
    btn.classList.add('added');
    setTimeout(function () {
        btn.textContent = 'أضيفي';
        btn.classList.remove('added');
    }, 1500);

    document.getElementById('cardQty-' + productId).value = '1';
    updateCardQtyControl(productId);
}

function flyToCart(imgElement, product) {
    var cartIcon = document.getElementById('cartIcon');
    if (!imgElement || !cartIcon) return;

    var imgRect = imgElement.getBoundingClientRect();
    var cartRect = cartIcon.getBoundingClientRect();

    // Clone the product image as the flying element
    var flyer = document.createElement('img');
    flyer.className = 'flying-product';
    flyer.src = imgElement.currentSrc || imgElement.src || (product && product.image) || '';
    flyer.style.left = imgRect.left + 'px';
    flyer.style.top = imgRect.top + 'px';
    flyer.style.width = imgRect.width + 'px';
    flyer.style.height = imgRect.height + 'px';
    document.body.appendChild(flyer);

    // Start and destination centers
    var startX = imgRect.left + imgRect.width / 2;
    var startY = imgRect.top + imgRect.height / 2;
    var endX = cartRect.left + cartRect.width / 2;
    var endY = cartRect.top + cartRect.height / 2;
    var dx = endX - startX;
    var dy = endY - startY;

    // Force reflow so the starting position is committed before animating
    flyer.getBoundingClientRect();

    requestAnimationFrame(function () {
        flyer.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.12)';
        flyer.style.opacity = '0.2';
    });

    // Cart shake as the image arrives
    setTimeout(function () {
        cartIcon.classList.add('cart-shake');
        setTimeout(function () { cartIcon.classList.remove('cart-shake'); }, 600);
    }, 750);

    // Clean up
    setTimeout(function () {
        if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
    }, 950);
}

function changeCardQty(productId, delta) {
    var input = document.getElementById('cardQty-' + productId);
    if (!input) return;
    setCardQty(productId, (parseInt(input.value, 10) || 1) + delta);
}

function getCartProductQuantity(productId) {
    return cart.reduce(function (sum, item) {
        return sum + (item.type !== 'custom_package' && item.id === productId ? (parseInt(item.qty, 10) || 0) : 0);
    }, 0);
}

function getAvailableProductQuantity(product) {
    return Math.max(0, (parseInt(product.stock, 10) || 0) - getCartProductQuantity(product.id));
}

function isProductSoldOut(product) {
    return product.status === 'soldout' || (parseInt(product.stock, 10) || 0) < 1;
}

function clampQuantity(product, quantity) {
    var available = getAvailableProductQuantity(product);
    return available ? Math.max(1, Math.min(parseInt(quantity, 10) || 1, available)) : 0;
}

function setCardQty(productId, quantity) {
    var product = products.find(function (entry) { return entry.id === productId; });
    var input = document.getElementById('cardQty-' + productId);
    if (!product || !input) return;
    var next = clampQuantity(product, quantity);
    if (next !== Number(quantity)) {
        input.classList.add('qty-corrected');
        setTimeout(function () { input.classList.remove('qty-corrected'); }, 220);
    }
    input.value = next || 1;
    updateCardQtyControl(productId);
}

function updateCardQtyControl(productId) {
    var product = products.find(function (entry) { return entry.id === productId; });
    var input = document.getElementById('cardQty-' + productId);
    var minus = document.getElementById('cardQtyMinus-' + productId);
    var plus = document.getElementById('cardQtyPlus-' + productId);
    if (!product || !input || !minus || !plus) return;
    var available = getAvailableProductQuantity(product);
    var value = Math.max(1, Math.min(parseInt(input.value, 10) || 1, available || 1));
    input.value = value;
    input.max = Math.max(1, available);
    input.disabled = available < 1;
    minus.disabled = available < 1 || value <= 1;
    plus.disabled = available < 1 || value >= available;
    var addButton = document.getElementById('cardAdd-' + productId);
    if (addButton) {
        var soldOut = isProductSoldOut(product);
        addButton.disabled = soldOut || available < 1;
        addButton.textContent = soldOut ? 'نفذت الكمية' : (available < 1 ? 'الكمية في السلة' : 'أضيفي');
    }
}

function updateCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var totalItems = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    if (totalItems > 0) {
        badge.style.display = 'flex';
        badge.textContent = totalItems;
    } else {
        badge.style.display = 'none';
    }
}

function toggleCart() {
    var sidebar = document.getElementById('cartSidebar');
    var overlay = document.getElementById('cartOverlay');
    var cartButton = document.getElementById('cartIcon');
    if (!sidebar || !overlay) return;
    var isOpen = sidebar.classList.contains('active');

    if (isOpen) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        sidebar.setAttribute('aria-hidden', 'true');
        sidebar.setAttribute('inert', '');
        document.body.style.overflow = '';
        if (cartButton) {
            cartButton.setAttribute('aria-expanded', 'false');
            cartButton.setAttribute('aria-label', 'فتح سلة التسوق');
            cartButton.focus();
        }
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        sidebar.setAttribute('aria-hidden', 'false');
        sidebar.removeAttribute('inert');
        document.body.style.overflow = 'hidden';
        if (cartButton) {
            cartButton.setAttribute('aria-expanded', 'true');
            cartButton.setAttribute('aria-label', 'إغلاق سلة التسوق');
        }
        renderCart();
        var closeButton = sidebar.querySelector('.cart-close');
        if (closeButton) closeButton.focus();
    }
}

document.addEventListener('keydown', function (event) {
    var sidebar = document.getElementById('cartSidebar');
    if (!sidebar || !sidebar.classList.contains('active')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        toggleCart();
        return;
    }
    if (event.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(sidebar.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

function renderCart() {
    var container = document.getElementById('cartItems');
    var footer = document.getElementById('cartFooter');
    if (!container || !footer) return;

    if (!cart.length) {
        container.innerHTML = '<div class="cart-empty"><span>🛒</span><p>السلة فارغة</p></div>';
        footer.style.display = 'none';
        updateCheckoutLink(0);
        return;
    }

    footer.style.display = 'block';
    container.innerHTML = cart.map(function (item) {
        if (item.type === 'custom_package') return renderCustomPackageCartItem(item);
        var product = products.find(function (entry) { return entry.id === item.id; });
        if (!product) return '';
        var sizeData = getSizeData(product, item.sizeIdx);
        var pricing = getFinalPrice(product, item.sizeIdx, discounts);
        var noMoreStock = getAvailableProductQuantity(product) < 1;
        return '<div class="cart-item"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"><div class="cart-item-info"><h4>' + product.name + '</h4><span class="cart-item-brand">' + product.brand + ' • ' + getSizeLabel(sizeData) + '</span><div class="cart-item-price">' + formatCurrency(pricing.final * item.qty) + '</div></div><div class="cart-item-qty"><button aria-label="تقليل كمية ' + product.name + '" onclick="updateCartQty(\'' + item.id + '\', ' + item.sizeIdx + ', -1)">−</button><span>' + item.qty + '</span><button aria-label="زيادة كمية ' + product.name + '" onclick="updateCartQty(\'' + item.id + '\', ' + item.sizeIdx + ', 1)"' + (noMoreStock ? ' disabled' : '') + '>+</button></div><button class="cart-item-remove" onclick="removeFromCart(\'' + item.id + '\', ' + item.sizeIdx + ')">✕</button></div>';
    }).join('');

    updateCheckoutLink(updateCartTotal());
}

function updateCartQty(productId, sizeIdx, delta) {
    var item = cart.find(function (entry) { return entry.id === productId && entry.sizeIdx === sizeIdx; });
    if (!item || item.type === 'custom_package') return;
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product || (delta > 0 && getAvailableProductQuantity(product) < 1)) return;
    item.qty += delta;
    if (item.qty < 1) {
        removeFromCart(productId, sizeIdx);
        return;
    }
    saveCart();
    updateCartBadge();
    renderCart();
}

function removeFromCart(productId, sizeIdx) {
    cart = cart.filter(function (entry) {
        if (entry.type === 'custom_package') return entry.id !== String(productId);
        return !(entry.id === productId && entry.sizeIdx === sizeIdx);
    });
    saveCart();
    updateCartBadge();
    renderCart();
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartBadge();
    renderCart();
}

function updateCartTotal() {
    var total = getCartKnownTotal();
    var totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = getTotalDisplayText(total, hasCustomPricingPending(cart));
    return total;
}

function updateCheckoutLink(total) {
    var btn = document.getElementById('checkoutBtn');
    if (!btn) return;
    btn.href = 'checkout.html';
    btn.classList.toggle('disabled', cart.length === 0);
}

function saveCart() {
    localStorage.setItem('mery_cart', JSON.stringify(normalizeCartItems(cart, products.length ? products : normalizeProducts(DEFAULT_PRODUCTS))));
}

function setDeliveryMethod(method) {
    deliveryMethod = method;
    localStorage.setItem('mery_delivery_method', method);
    var pickupBtn = document.getElementById('optPickup');
    var deliveryBtn = document.getElementById('optDelivery');
    if (pickupBtn) pickupBtn.classList.toggle('active', method === 'pickup');
    if (deliveryBtn) deliveryBtn.classList.toggle('active', method === 'delivery');
}

// ===== Hero Slider =====
var heroSlideIndex = 0;
var heroSlideTimer = null;

function renderHeroSlider(slides) {
    var section = document.getElementById('heroSection');
    var dotsEl = document.getElementById('heroDots');
    if (!section || !slides || !slides.length) return;

    var safeSlides = slides.filter(function (slide) {
        return slide && typeof slide.url === 'string' && /^https:\/\//i.test(slide.url);
    });
    if (!safeSlides.length) return;

    var html = safeSlides.map(function(slide, idx) {
        var media = '';
        if (slide.type === 'video') {
            media = '<video src="' + slide.url + '" muted playsinline' + (idx === 0 ? ' autoplay' : '') + ' onended="goHeroSlide(' + ((idx + 1) % safeSlides.length) + ')"></video>';
        } else {
            media = '<img src="' + slide.url + '" alt="Mery Beauty Store hero image">';
        }
        return '<div class="hero-slide' + (idx === 0 ? ' active' : '') + '">' + media +
            '<div class="hero-overlay"><div class="hero-content">' +
            '<h1 class="hero-title" lang="en" dir="ltr">' + escapeHtml(siteSettings.heroTitle) + '</h1>' +
            '<p class="hero-subtitle" lang="en" dir="ltr">' + escapeHtml(siteSettings.heroSubtitle) + '</p>' +
            '<a href="#products" class="btn-primary">تسوقي الآن</a>' +
            '</div></div></div>';
    }).join('');
    section.innerHTML = html;

    // Dots
    if (dotsEl && safeSlides.length > 1) {
        dotsEl.innerHTML = safeSlides.map(function(_, idx) {
            return '<button class="' + (idx === 0 ? 'active' : '') + '" onclick="goHeroSlide(' + idx + ')"></button>';
        }).join('');
        section.appendChild(dotsEl);
        dotsEl.style.display = 'flex';
    }

    // Auto-advance
    startHeroSlideTimer();
}

function goHeroSlide(n) {
    var section = document.getElementById('heroSection');
    if (!section) return;
    var allSlides = section.querySelectorAll('.hero-slide');
    var allDots = section.querySelectorAll('.hero-dots button');
    if (!allSlides.length) return;
    if (allSlides[heroSlideIndex]) allSlides[heroSlideIndex].classList.remove('active');
    if (allDots[heroSlideIndex]) allDots[heroSlideIndex].classList.remove('active');
    heroSlideIndex = n;
    if (allSlides[heroSlideIndex]) allSlides[heroSlideIndex].classList.add('active');
    if (allDots[heroSlideIndex]) allDots[heroSlideIndex].classList.add('active');
    var vid = allSlides[heroSlideIndex] ? allSlides[heroSlideIndex].querySelector('video') : null;
    if (vid) { vid.currentTime = 0; vid.play(); }
    startHeroSlideTimer();
}

function startHeroSlideTimer() {
    if (heroSlideTimer) clearInterval(heroSlideTimer);
    heroSlideTimer = setInterval(function() {
        var section = document.getElementById('heroSection');
        if (!section) return;
        var allSlides = section.querySelectorAll('.hero-slide');
        if (allSlides.length <= 1) return;
        var current = allSlides[heroSlideIndex];
        if (current && !current.querySelector('video')) {
            goHeroSlide((heroSlideIndex + 1) % allSlides.length);
        }
    }, 5000);
}

function openPDP(productId) {
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;

    currentPDPProduct = product;
    currentPDPSizeIdx = 0;
    pdpQty = 1;

    document.getElementById('pdpImage').innerHTML = '<img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">';
    document.getElementById('pdpBrand').textContent = product.brand;
    document.getElementById('pdpName').textContent = product.name;
    document.getElementById('pdpQty').value = '1';
    renderPDPSizeOptions();
    updatePDPDisplay();
    updatePDPQtyControl();

    var addBtn = document.getElementById('pdpAddBtn');
    if (isProductSoldOut(product) || getAvailableProductQuantity(product) < 1) {
        addBtn.textContent = isProductSoldOut(product) ? 'نفذت الكمية' : 'الكمية في السلة';
        addBtn.disabled = true;
        addBtn.style.background = '#9ca3af';
    } else {
        addBtn.textContent = 'أضيفي للسلة';
        addBtn.disabled = false;
        addBtn.style.background = '';
    }

    renderRelatedProducts(product);
    document.getElementById('pdpModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var url = new URL(window.location.href);
    url.searchParams.set('product', productId);
    window.history.replaceState({}, '', url);
}

function renderRelatedProducts(product) {
    var container = document.getElementById('pdpRelatedGrid');
    var section = document.getElementById('pdpRelated');
    if (!container || !section) return;

    var related = products.filter(function (p) {
        return p.id !== product.id && (p.category === product.category || p.brand === product.brand);
    }).slice(0, 4);

    if (related.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = related.map(function (p) {
        var pricing = getFinalPrice(p, 0, discounts);
        return '<div class="pdp-related-item" onclick="openPDP(\'' + p.id + '\')">' +
            '<img src="' + p.image + '" alt="' + p.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
            '<div class="related-info"><p>' + p.name + '</p><span>' + formatCurrency(pricing.final) + '</span></div>' +
            '</div>';
    }).join('');
}

function renderPDPSizeOptions() {
    var section = document.getElementById('pdpSizeSection');
    var container = document.getElementById('pdpSizes');
    if (!currentPDPProduct || !section || !container) return;

    if (currentPDPProduct.sizes.length <= 1) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    section.style.display = 'flex';
    container.innerHTML = currentPDPProduct.sizes.map(function (size, idx) {
        return '<button type="button" class="pdp-size-btn ' + (idx === currentPDPSizeIdx ? 'active' : '') + '" onclick="selectPDPSize(' + idx + ')">' + getSizeLabel(size) + '</button>';
    }).join('');
}

function selectPDPSize(sizeIdx) {
    currentPDPSizeIdx = sizeIdx;
    renderPDPSizeOptions();
    updatePDPDisplay();
}

function updatePDPDisplay() {
    if (!currentPDPProduct) return;
    var sizeData = getSizeData(currentPDPProduct, currentPDPSizeIdx);
    var pricing = getFinalPrice(currentPDPProduct, currentPDPSizeIdx, discounts);
    document.getElementById('pdpMeta').innerHTML = '<span>' + currentPDPProduct.category + '</span><span>' + getSizeLabel(sizeData) + '</span>';
    document.getElementById('pdpPrice').innerHTML = (pricing.hasDiscount ? '<span class="original-price">' + formatCurrency(pricing.original) + '</span>' : '') + '<span class="final-price">' + formatCurrency(pricing.final) + '</span>';
}

function closePDP(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('pdpModal').style.display = 'none';
    document.body.style.overflow = '';
    currentPDPProduct = null;
    var url = new URL(window.location.href);
    url.searchParams.delete('product');
    window.history.replaceState({}, '', url);
}

function changePDPQty(delta) {
    setPDPQty(pdpQty + delta);
}

function setPDPQty(quantity) {
    if (!currentPDPProduct) return;
    var input = document.getElementById('pdpQty');
    var next = clampQuantity(currentPDPProduct, quantity);
    if (next !== Number(quantity)) {
        input.classList.add('qty-corrected');
        setTimeout(function () { input.classList.remove('qty-corrected'); }, 220);
    }
    pdpQty = next || 1;
    input.value = pdpQty;
    updatePDPQtyControl();
}

function updatePDPQtyControl() {
    if (!currentPDPProduct) return;
    var available = getAvailableProductQuantity(currentPDPProduct);
    var input = document.getElementById('pdpQty');
    var minus = document.getElementById('pdpQtyMinus');
    var plus = document.getElementById('pdpQtyPlus');
    if (!input || !minus || !plus) return;
    pdpQty = Math.max(1, Math.min(pdpQty, available || 1));
    input.value = pdpQty;
    input.max = Math.max(1, available);
    input.disabled = available < 1;
    minus.disabled = available < 1 || pdpQty <= 1;
    plus.disabled = available < 1 || pdpQty >= available;
}

function addFromPDP() {
    if (!currentPDPProduct || currentPDPProduct.status === 'soldout') return;
    if (getAvailableProductQuantity(currentPDPProduct) < pdpQty) {
        updatePDPQtyControl();
        return;
    }

    var pricing = getFinalPrice(currentPDPProduct, currentPDPSizeIdx, discounts);
    var existing = cart.find(function (item) { return item.id === currentPDPProduct.id && item.sizeIdx === currentPDPSizeIdx; });
    if (existing) existing.qty += pdpQty;
    else cart.push({ id: currentPDPProduct.id, sizeIdx: currentPDPSizeIdx, qty: pdpQty, price: pricing.final, name: currentPDPProduct.name, brand: currentPDPProduct.brand, image: currentPDPProduct.image });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());

    var img = document.querySelector('#pdpImage img');
    if (img) flyToCart(img, currentPDPProduct);

    var btn = document.getElementById('pdpAddBtn');
    btn.textContent = 'تمت الإضافة';
    btn.classList.add('added');
    setTimeout(function () {
        btn.textContent = 'أضيفي للسلة';
        btn.classList.remove('added');
        closePDP();
    }, 1200);
    updatePDPQtyControl();
    updateCardQtyControl(currentPDPProduct.id);
}
