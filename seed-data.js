// Seed data for Mery Beauty Store
// Run via: window.seedFirestoreData(true)  (while logged into the admin so the API token is set)

window.seedFirestoreData = function(clearExisting) {
    var db = window.db;

    var products = [
        {
            name: 'AXIS-Y Eye Serum',
            brand: 'AXIS-Y',
            category: 'عناية بالبشرة',
            price: 90,
            image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop',
            description: 'سيروم AXIS-Y للعين بالكولاجين النباتي - يعالج الهالات والتجاعيد',
            discount: 15,
            status: 'bestseller',
            inStock: true,
            order: 1
        },
        {
            name: 'VT MILD REEDLE SHOT 50',
            brand: 'VT Cosmetics',
            category: 'عناية بالبشرة',
            price: 100,
            image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop',
            description: 'أمبولة لطيفة بمكون Cicahyalon الحاصل على براءة اختراع لتجديد البشرة',
            status: 'bestseller',
            inStock: true,
            order: 2
        },
        {
            name: 'Beauty of Joseon Relief Sun',
            brand: 'Beauty of Joseon',
            category: 'واقي شمس',
            price: 85,
            image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&h=400&fit=crop',
            description: 'واقي شمس بالأرز والبروبيوتيك - حماية يومية خفيفة على البشرة',
            discount: 10,
            status: 'bestseller',
            inStock: true,
            order: 3
        },
        {
            name: 'Neat Shower Gel',
            brand: 'Neat',
            category: 'العناية بالجسم',
            price: 60,
            image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=400&h=400&fit=crop',
            description: 'شاور جل الانتعاش والعناية اليومية - تنظيف لطيف ورائحة منعشة',
            status: '',
            inStock: true,
            order: 4
        },
        {
            name: 'The Hoppa Dewy Glow Mist Serum',
            brand: 'Hoppa',
            category: 'عناية بالبشرة',
            price: 75,
            image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&h=400&fit=crop',
            description: 'سيروم ميست للإشراقة الندية - ترطيب فوري وتوهج طبيعي',
            discount: 20,
            status: 'special',
            inStock: true,
            order: 5
        },
        {
            name: 'BioBalance Super Eye Cream',
            brand: 'BioBalance',
            category: 'عناية بالبشرة',
            price: 100,
            image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop',
            description: 'كريم عين بالكولاجين وحمض الهيالورونيك وفيتامين سي',
            discount: 15,
            status: '',
            inStock: true,
            order: 6
        },
        {
            name: 'MINEADERM Advanced Recovery Cream',
            brand: 'MINEADERM',
            category: 'عناية بالبشرة',
            price: 120,
            image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&h=400&fit=crop',
            description: 'كريم متقدم لاستعادة نضارة البشرة وترميمها',
            status: 'special',
            inStock: true,
            order: 7
        },
        {
            name: 'Maruderm Azaleic Acid 10% Serum',
            brand: 'Maruderm',
            category: 'عناية بالبشرة',
            price: 65,
            image: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=400&h=400&fit=crop',
            description: 'سيروم حمض الأزيلايك 10% لعلاج حب الشباب والتصبغات',
            status: '',
            inStock: true,
            order: 8
        },
        {
            name: 'I LOVE Face Masks Set',
            brand: 'I LOVE',
            category: 'باكجات',
            price: 50,
            image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop',
            description: 'مجموعة 4 أقنعة للوجه بتركيبات مغذية ومنعشة',
            status: '',
            inStock: true,
            order: 9
        },
        {
            name: 'I LOVE Body Mists Set',
            brand: 'I LOVE',
            category: 'باكجات',
            price: 70,
            image: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=400&h=400&fit=crop',
            description: 'مجموعة 4 بخاخات عطرية للجسم بروائح فواكه منعشة',
            status: 'bestseller',
            inStock: true,
            order: 10
        },
        {
            name: 'I LOVE Bath Fizzers',
            brand: 'I LOVE',
            category: 'باكجات',
            price: 55,
            image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400&h=400&fit=crop',
            description: 'مجموعة 8 فوارات استحمام بروائح متنوعة',
            status: '',
            inStock: true,
            order: 11
        },
        {
            name: 'Weiss Deep Cleaning Teeth Wipes',
            brand: 'Weiss',
            category: 'عناية بالأسنان',
            price: 35,
            image: 'https://images.unsplash.com/photo-1559650656-5d1d361ad10e?w=400&h=400&fit=crop',
            description: 'مناديل تنظيف عميق للأسنان - تبييض وإزالة البقع',
            status: 'special',
            inStock: true,
            order: 12
        },
        {
            name: 'SESDERMA C-VIT Serum',
            brand: 'SESDERMA',
            category: 'عناية بالبشرة',
            price: 150,
            image: 'https://images.unsplash.com/photo-1615396899839-c99c121888b0?w=400&h=400&fit=crop',
            description: 'سيروم فيتامين سي المركز لإشراقة فورية ومحاربة التجاعيد',
            status: 'special',
            inStock: true,
            order: 13
        },
        {
            name: 'Neat Body Butter + Deodorant',
            brand: 'Neat',
            category: 'باكجات',
            price: 110,
            image: 'https://images.unsplash.com/photo-1601049676869-702ea24cfd58?w=400&h=400&fit=crop',
            description: 'بكج زبدة الجسم ومزيل العرق الطبيعي من Neat',
            status: 'bestseller',
            inStock: true,
            order: 14
        },
        {
            name: 'Dr.Clinic Prebiotic Foam',
            brand: 'Dr.Clinic',
            category: 'عناية بالبشرة',
            price: 35,
            image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop',
            description: 'رغوة تنظيف بالبريبيوتيك لطيفة وفعالة لجميع أنواع البشرة',
            status: '',
            inStock: true,
            order: 15
        },
        {
            name: 'SESDERMA Azelac RU Serum',
            brand: 'SESDERMA',
            category: 'عناية بالبشرة',
            price: 160,
            image: 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400&h=400&fit=crop',
            description: 'سيروم لعلاج التصبغات وتوحيد لون البشرة',
            status: '',
            inStock: true,
            order: 16
        },
        {
            name: 'Laverne Shampoo',
            brand: 'Laverne',
            category: 'عناية بالشعر',
            price: 45,
            image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=400&h=400&fit=crop',
            description: 'شامبو لافيرن للعناية بالشعر التالف والمتقصف',
            status: '',
            inStock: true,
            order: 17
        },
        {
            name: 'بكج دلع الشاور',
            brand: 'Neat',
            category: 'العناية بالجسم',
            price: 60,
            image: 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=400&h=400&fit=crop',
            description: 'روتين استحمام ممتع وفاخر بقوام كريمي خفيف',
            status: 'special',
            inStock: true,
            order: 18
        },
        {
            name: 'Hoppa Vitamin C Serum',
            brand: 'Hoppa',
            category: 'عناية بالبشرة',
            price: 80,
            image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&h=400&fit=crop',
            description: 'سيروم فيتامين سي من هوبا لتفتيح وتوحيد لون البشرة',
            status: '',
            inStock: true,
            order: 19
        },
        {
            name: 'I LOVE Fresh Slice Gift Set',
            brand: 'I LOVE',
            category: 'باكجات',
            price: 85,
            image: 'https://images.unsplash.com/photo-1583209814683-c023dd293cc6?w=400&h=400&fit=crop',
            description: 'بكج هدية يحتوي على غسول ولوشن وفوّارة وربطة شعر',
            status: '',
            inStock: true,
            order: 20
        },
        {
            name: 'AXIS-Y Dark Spot Correcting Glow Serum',
            brand: 'AXIS-Y',
            category: 'عناية بالبشرة',
            price: 95,
            image: 'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?w=400&h=400&fit=crop',
            description: 'سيروم تصحيح البقع الداكنة والإشراقة من AXIS-Y',
            status: 'bestseller',
            inStock: true,
            order: 21
        },
        {
            name: 'BioBalance Hyaluronic Acid Serum',
            brand: 'BioBalance',
            category: 'عناية بالبشرة',
            price: 70,
            image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop',
            description: 'سيروم حمض الهيالورونيك للترطيب العميق ومحاربة الجفاف',
            status: '',
            inStock: true,
            order: 22
        },
        {
            name: 'Weiss Whitening Toothpaste',
            brand: 'Weiss',
            category: 'عناية بالأسنان',
            price: 40,
            image: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=400&h=400&fit=crop',
            description: 'معجون أسنان مبيض بتركيبة متقدمة لأسنان ناصعة البياض',
            status: '',
            inStock: true,
            order: 23
        },
        {
            name: 'MaruDerm SPF50 Sunscreen',
            brand: 'Maruderm',
            category: 'واقي شمس',
            price: 55,
            image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop',
            description: 'واقي شمس SPF50 خفيف على البشرة بحماية عالية',
            status: '',
            inStock: true,
            order: 24
        },
        {
            name: 'Laverne Hair Mask',
            brand: 'Laverne',
            category: 'عناية بالشعر',
            price: 50,
            image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=400&h=400&fit=crop',
            description: 'ماسك شعر مغذي لاستعادة الحيوية واللمعان',
            status: '',
            inStock: true,
            order: 25
        }
    ];

    function runSeed() {
        var batch = db.batch();
        var productsRef = db.collection('products');
        var settingsRef = db.collection('settings').doc('config');

        var settings = {
            whatsappNumber: '972569236758',
            heroTitle: 'Mery Glam',
            heroSubtitle: 'from beautiful girl to another',
            aboutText: 'في Mery Beauty Store اخترنا لكِ منتجات الجمال والعناية بلمسة مرحة وناعمة.\nتسوّقي المكياج، العناية، الباكجات والعروض بسهولة، وكل طلب مجهّز بحب من جميلة إلى جميلة.',
            instagramLink: 'https://www.instagram.com/',
            tiktokLink: ''
        };

        if (clearExisting) {
            console.log('Clearing existing data...');
            return productsRef.get().then(function(snapshot) {
                var deleteBatch = db.batch();
                snapshot.forEach(function(doc) { deleteBatch.delete(doc.ref); });
                return deleteBatch.commit();
            }).then(function() {
                var addBatch = db.batch();
                products.forEach(function(product, index) {
                    var docRef = productsRef.doc(String(index + 1));
                    product.id = index + 1;
                    product.sizes = [{ size: '-', unit: 'ml', price: product.price }];
                    addBatch.set(docRef, product);
                });
                addBatch.set(settingsRef, settings);
                return addBatch.commit();
            }).then(function() {
                console.log('Seeded ' + products.length + ' products successfully!');
            });
        }

        products.forEach(function(product, index) {
            var docRef = productsRef.doc(String(index + 1));
            product.id = index + 1;
            product.sizes = [{ size: '-', unit: 'ml', price: product.price }];
            batch.set(docRef, product);
        });
        batch.set(settingsRef, settings);
        return batch.commit().then(function() {
            console.log('Seeded ' + products.length + ' products successfully!');
        });
    }

    return runSeed();
};