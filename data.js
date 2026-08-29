var DEFAULT_PRODUCTS = [];

var DEFAULT_DISCOUNTS = [];

var DEFAULT_SITE_SETTINGS = {
    whatsappNumber: '972569236758',
    heroTitle: 'Mery Glam',
    heroSubtitle: 'from beautiful girl to another',
    aboutText: 'في Mery Beauty Store اخترنا لكِ منتجات الجمال والعناية بلمسة مرحة وناعمة.\nتسوّقي المكياج، العناية، الباكجات والعروض بسهولة، وكل طلب مجهّز بحب من جميلة إلى جميلة.',
    instagramLink: 'https://www.instagram.com/',
    tiktokLink: ''
};

var BRANDS_DATA = [];

function normalizeSizeEntry(entry) {
    if (!entry) return { size: '-', unit: 'cm', price: 0 };
    var unit = entry.unit || 'cm';
    return {
        size: String(entry.size || '-').trim() || '-',
        unit: unit,
        price: Number(entry.price) || 0
    };
}

function normalizeProduct(product) {
    var sizes = Array.isArray(product && product.sizes) && product.sizes.length
        ? product.sizes.map(normalizeSizeEntry)
        : [normalizeSizeEntry({ size: product && product.size, unit: product && product.unit, price: product && product.price })];

    return {
        id: (product && product.id) || String(Date.now()),
        name: (product && product.name) || '',
        brand: (product && product.brand) || '',
        category: (product && product.category) || '',
        sizes: sizes.filter(function (size) { return size.size && size.price >= 0; }),
        discount: Number(product && product.discount) || 0,
        image: (product && product.image) || '',
        status: (product && product.status) || 'normal',
        stock: product && product.stock != null && product.stock !== '' ? Math.max(0, parseInt(product.stock, 10) || 0) : undefined
    };
}

function normalizeProducts(list) {
    return (Array.isArray(list) ? list : []).map(normalizeProduct).sort(function (a, b) { return a.id - b.id; });
}

function normalizeDiscount(discount) {
    var values = [];
    if (discount && discount.values && Array.isArray(discount.values)) {
        values = discount.values;
    } else if (discount && discount.value) {
        values = String(discount.value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    }
    return {
        id: String(discount && discount.id ? discount.id : Date.now()),
        type: ['brand', 'category', 'manual', 'all'].indexOf(discount && discount.type) >= 0 ? discount.type : 'manual',
        value: values.join(', '),
        values: values,
        percentage: Number(discount && discount.percentage) || 0,
        description: String(discount && discount.description ? discount.description : '').trim(),
        expiresAt: discount && discount.expiresAt ? discount.expiresAt : ''
    };
}

function normalizeDiscounts(list) {
    return (Array.isArray(list) ? list : []).map(normalizeDiscount);
}

function extractWhatsappNumber(input) {
    var raw = String(input || '').trim();
    if (!raw) return DEFAULT_SITE_SETTINGS.whatsappNumber;
    var fromLink = raw.indexOf('wa.me/') >= 0 ? raw.split('wa.me/')[1] : raw;
    return fromLink.replace(/[^\d]/g, '');
}

function buildWhatsAppUrl(number, message) {
    var safeNumber = extractWhatsappNumber(number);
    var text = message ? '?text=' + encodeURIComponent(message) : '';
    return 'https://wa.me/' + safeNumber + text;
}

function normalizeSettings(settings) {
    var source = settings || {};
    return {
        whatsappNumber: extractWhatsappNumber(source.whatsappNumber || source.whatsappLink || DEFAULT_SITE_SETTINGS.whatsappNumber),
        heroTitle: String(source.heroTitle || DEFAULT_SITE_SETTINGS.heroTitle),
        heroSubtitle: String(source.heroSubtitle || DEFAULT_SITE_SETTINGS.heroSubtitle),
        aboutText: String(source.aboutText || DEFAULT_SITE_SETTINGS.aboutText),
        instagramLink: String(source.instagramLink || DEFAULT_SITE_SETTINGS.instagramLink),
        tiktokLink: String(source.tiktokLink || DEFAULT_SITE_SETTINGS.tiktokLink)
    };
}

function getSizeData(product, sizeIdx) {
    if (!product || !Array.isArray(product.sizes) || !product.sizes.length) return { size: '-', unit: '', price: product ? product.price || 0 : 0 };
    var safeIndex = Math.max(0, Math.min(Number(sizeIdx) || 0, product.sizes.length - 1));
    return product.sizes[safeIndex];
}

function getUnitLabel(unit) {
    if (unit === 'g') return 'غرام';
    if (unit === 'cm') return 'سم';
    if (unit === 'ml') return 'مل';
    if (unit === 'قطعة') return '';
    return '';
}

function getSizeLabel(sizeData) {
    if (!sizeData || !String(sizeData.size || '').trim() || String(sizeData.size).trim() === '-') return '';
    var label = getUnitLabel(sizeData.unit);
    if (!label) return String(sizeData.size);
    return String(sizeData.size) + ' ' + label;
}

function getProductDiscountPercent(product, discounts) {
    var discountPercent = Number(product && product.discount) || 0;
    var now = new Date().toISOString().slice(0, 10);
    normalizeDiscounts(discounts).forEach(function (discount) {
        if (discount.expiresAt && discount.expiresAt < now) return;
        if (discount.type === 'all') discountPercent = Math.max(discountPercent, discount.percentage);
        if (discount.type === 'brand' && discount.values.indexOf(product.brand) >= 0) discountPercent = Math.max(discountPercent, discount.percentage);
        if (discount.type === 'category' && discount.values.indexOf(product.category) >= 0) discountPercent = Math.max(discountPercent, discount.percentage);
    });
    return discountPercent;
}

function getFinalPrice(product, sizeIdx, discounts) {
    var sizeData = getSizeData(product, sizeIdx);
    var discountPercent = getProductDiscountPercent(product, discounts || []);
    if (discountPercent > 0) {
        return {
            original: Number(sizeData.price) || 0,
            final: Math.round((Number(sizeData.price) || 0) * (1 - discountPercent / 100)),
            hasDiscount: true,
            discountPercent: discountPercent
        };
    }

    return {
        original: Number(sizeData.price) || 0,
        final: Number(sizeData.price) || 0,
        hasDiscount: false,
        discountPercent: 0
    };
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeCustomPackageSet(entry) {
    return {
        chocolateType: String(entry && entry.chocolateType ? entry.chocolateType : 'mixed'),
        filling: String(entry && entry.filling ? entry.filling : 'plain'),
        qty: Math.max(1, parseInt(entry && entry.qty, 10) || 1)
    };
}

function normalizeCustomPackageItem(item) {
    var sets = Array.isArray(item && item.sets)
        ? item.sets.map(function (entry) { return normalizeCustomPackageSet(entry); }).filter(function (entry) { return entry.qty > 0; })
        : [];
    if (!sets.length) sets = [normalizeCustomPackageSet({})];
    var delivery = item && item.delivery === 'pickup' ? 'pickup' : 'delivery';
    return {
        type: 'custom_package',
        id: String(item && item.id ? item.id : 'pkg_' + Date.now()),
        sets: sets,
        wrapperColor: String(item && item.wrapperColor ? item.wrapperColor : 'gold'),
        notes: String(item && item.notes ? item.notes : ''),
        delivery: delivery,
        customerName: String(item && item.customerName ? item.customerName : ''),
        customerPhone: String(item && item.customerPhone ? item.customerPhone : ''),
        customerLocation: delivery === 'delivery' ? String(item && item.customerLocation ? item.customerLocation : '') : '',
        qty: 1,
        pricePending: true
    };
}

function isCustomPackageItem(item) {
    return !!(item && item.type === 'custom_package');
}

function getCustomPackageTitle(item) {
    var setsCount = Array.isArray(item && item.sets) ? item.sets.length : 0;
    return 'علبة مخصصة (' + setsCount + ' تشكيلات)';
}

function hasCustomPricingPending(items) {
    return (Array.isArray(items) ? items : []).some(function (item) {
        return isCustomPackageItem(item);
    });
}

function getTotalDisplayText(total, hasPending) {
    var safeTotal = Math.max(0, Number(total) || 0);
    if (hasPending) {
        return safeTotal > 0 ? formatCurrency(safeTotal) + ' + سعر العلبة المخصصة يحدد لاحقاً' : 'يحدد بعد تأكيد الإدارة';
    }
    return formatCurrency(safeTotal);
}

function normalizeCartItems(items, products) {
    return (Array.isArray(items) ? items : []).map(function (item) {
        if (isCustomPackageItem(item)) return normalizeCustomPackageItem(item);
        var itemId = item.id;
        var product = Array.isArray(products) ? products.find(function (entry) { return String(entry.id) === String(itemId); }) : null;
        var sizesLength = product && Array.isArray(product.sizes) && product.sizes.length ? product.sizes.length : 1;
        var safeSizeIdx = Math.max(0, Math.min(sizesLength - 1, parseInt(item.sizeIdx, 10) || 0));
        return {
            id: itemId,
            sizeIdx: safeSizeIdx,
            qty: Math.max(1, parseInt(item.qty, 10) || 1),
            price: Math.max(0, Number(item.price) || 0)
        };
    }).filter(function (item) {
        if (isCustomPackageItem(item)) return !!item.id;
        return !!item.id;
    });
}

function formatCurrency(value) {
    return '\u20AA' + (Number(value) || 0);
}

function formatDateTime(dateValue) {
    var date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('ar-PS', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function makeOrderId() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var idx = 0; idx < 5; idx += 1) {
        code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return 'ORD-' + code;
}
