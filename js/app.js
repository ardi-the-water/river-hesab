document.addEventListener('DOMContentLoaded', async () => {
    // To change the password, modify the value of 'correctPassword'
    const correctPassword = '1234';
    const isAuthenticated = sessionStorage.getItem('isAuthenticated');

    if (!isAuthenticated) {
        const password = prompt('لطفا رمز عبور را وارد کنید:');
        if (password === correctPassword) {
            sessionStorage.setItem('isAuthenticated', 'true');
        } else {
            alert('رمز عبور اشتباه است.');
            document.body.innerHTML = '<h1>دسترسی غیرمجاز</h1>';
            return;
        }
    }

    try {
        await openDB();
        const page = window.location.pathname.split("/").pop();

        if (page === 'items.html' || page === '') {
            initItemsPage();
        }
        if (page === 'index.html' || page === '') {
            initOrderPage();
        }
        if (page === 'orders.html') {
            initOrdersListPage();
        }
        if (page === 'settings.html') {
            initSettingsPage();
        }
    } catch (error) {
        console.error("Initialization failed:", error);
    }
});

// Helper function to format numbers with commas
function formatPrice(number) {
    return new Intl.NumberFormat('fa-IR').format(number);
}

// ===================================================================
// Items Page Logic
// ===================================================================
async function initItemsPage() {
    const form = document.getElementById('add-item-form');
    if (form) {
        form.addEventListener('submit', handleAddItem);
        await displayItems();
    }
}

async function handleAddItem(event) {
    event.preventDefault();
    const name = document.getElementById('item-name').value;
    const purchasePrice = parseFloat(document.getElementById('purchase-price').value);
    const sellPrice = parseFloat(document.getElementById('sell-price').value);

    if (name && !isNaN(purchasePrice) && !isNaN(sellPrice)) {
        const newItem = { name, purchasePrice, sellPrice };
        await add('items', newItem);
        alert('آیتم با موفقیت اضافه شد.');
        event.target.reset();
        await displayItems();
    } else {
        alert('لطفا تمام فیلدها را به درستی پر کنید.');
    }
}

async function displayItems() {
    const itemsTableBody = document.querySelector('#items-table tbody');
    if (!itemsTableBody) return;

    const items = await getAll('items');
    itemsTableBody.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', item.id);
        row.innerHTML = `
            <td data-label="نام آیتم">${item.name}</td>
            <td data-label="قیمت خرید">${formatPrice(item.purchasePrice)}</td>
            <td data-label="قیمت فروش">${formatPrice(item.sellPrice)}</td>
            <td data-label="عملیات">
                <button onclick="toggleEditMode(${item.id})">ویرایش</button>
                <button onclick="deleteItem(${item.id})">حذف</button>
            </td>
        `;
        itemsTableBody.appendChild(row);
    });
}

async function deleteItem(id) {
    if (confirm('آیا از حذف این آیتم مطمئن هستید؟')) {
        await remove('items', id);
        await displayItems();
    }
}

function toggleEditMode(id) {
    const row = document.querySelector(`tr[data-id='${id}']`);
    const cells = row.querySelectorAll('td');
    
    const name = cells[0].textContent;
    const purchasePrice = parseFloat(cells[1].textContent.replace(/,/g, ''));
    const sellPrice = parseFloat(cells[2].textContent.replace(/,/g, ''));

    row.innerHTML = `
        <td data-label="نام آیتم"><input type="text" value="${name}" id="edit-name-${id}"></td>
        <td data-label="قیمت خرید"><input type="number" value="${purchasePrice}" id="edit-purchase-${id}"></td>
        <td data-label="قیمت فروش"><input type="number" value="${sellPrice}" id="edit-sell-${id}"></td>
        <td data-label="عملیات">
            <button onclick="updateItem(${id})">ذخیره</button>
            <button onclick="displayItems()">لغو</button>
        </td>
    `;
}

async function updateItem(id) {
    const newName = document.getElementById(`edit-name-${id}`).value;
    const newPurchasePrice = parseFloat(document.getElementById(`edit-purchase-${id}`).value);
    const newSellPrice = parseFloat(document.getElementById(`edit-sell-${id}`).value);

    if (newName && !isNaN(newPurchasePrice) && !isNaN(newSellPrice)) {
        const updatedItem = { id, name: newName, purchasePrice: newPurchasePrice, sellPrice: newSellPrice };
        await update('items', updatedItem);
        await displayItems();
    } else {
        alert('لطفا تمام فیلدها را به درستی پر کنید.');
    }
}


// ===================================================================
// Order Taking Page Logic (index.html)
// ===================================================================
let currentOrderItems = [];
let allMenuItems = []; // Cache menu items
let editOrderId = null;

async function initOrderPage() {
    const urlParams = new URLSearchParams(window.location.search);
    editOrderId = urlParams.get('editOrderId') ? parseInt(urlParams.get('editOrderId')) : null;

    const menuContainer = document.getElementById('menu-items-list');
    const searchInput = document.getElementById('search-menu');
    if (menuContainer) {
        await loadMenuItems();
    }
    if (searchInput) {
        searchInput.addEventListener('input', filterMenuItems);
    }
    const finalizeBtn = document.getElementById('finalize-order');
    if(finalizeBtn) {
        finalizeBtn.addEventListener('click', finalizeOrder);
    }

    if (editOrderId) {
        await loadOrderForEditing(editOrderId);
        document.querySelector('#order-section h2').textContent = `ویرایش سفارش شماره ${editOrderId}`;
        finalizeBtn.textContent = 'ذخیره تغییرات';
    }
}

async function loadOrderForEditing(id) {
    const transaction = db.transaction(['orders'], 'readonly');
    const store = transaction.objectStore('orders');
    const request = store.get(id);

    request.onsuccess = () => {
        const order = request.result;
        if (order) {
            currentOrderItems = order.items;
            document.getElementById('discount').value = order.discount;
            document.getElementById('order-notes').value = order.notes || '';
            displayCurrentOrder();
        } else {
            alert('سفارش مورد نظر یافت نشد.');
            editOrderId = null;
        }
    };
    request.onerror = (event) => {
        console.error("Error loading order for editing:", event.target.errorCode);
    };
}

async function loadMenuItems() {
    allMenuItems = await getAll('items');
    renderMenuItems(allMenuItems);
}

function renderMenuItems(items) {
    const menuContainer = document.getElementById('menu-items-list');
    menuContainer.innerHTML = ''; // Clear previous items
    items.forEach(item => {
        const itemElement = document.createElement('button');
        itemElement.textContent = `${item.name} - ${formatPrice(item.sellPrice)} تومان`;
        itemElement.onclick = () => addItemToOrder(item, 1); // Always add one
        menuContainer.appendChild(itemElement);
    });
}

function filterMenuItems(event) {
    const searchTerm = event.target.value.toLowerCase();
    const filteredItems = allMenuItems.filter(item => item.name.toLowerCase().includes(searchTerm));
    renderMenuItems(filteredItems);
}

function addItemToOrder(item, quantity) {
    const existingItem = currentOrderItems.find(orderItem => orderItem.id === item.id);
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        currentOrderItems.push({ ...item, quantity: quantity });
    }
    displayCurrentOrder();
}

function displayCurrentOrder() {
    const orderList = document.getElementById('order-list');
    const totalPriceEl = document.getElementById('total-price');
    orderList.innerHTML = '';
    let totalPrice = 0;

    currentOrderItems.forEach((item, index) => {
        const listItem = document.createElement('li');
        
        const itemText = document.createElement('span');
        itemText.textContent = `${item.name} - ${formatPrice(item.quantity * item.sellPrice)} تومان`;

        const quantityControl = document.createElement('div');
        quantityControl.className = 'quantity-control';

        const decreaseBtn = document.createElement('button');
        decreaseBtn.textContent = '-';
        decreaseBtn.onclick = () => updateItemQuantity(index, -1);

        const quantitySpan = document.createElement('span');
        quantitySpan.textContent = item.quantity;

        const increaseBtn = document.createElement('button');
        increaseBtn.textContent = '+';
        increaseBtn.onclick = () => updateItemQuantity(index, 1);

        quantityControl.appendChild(decreaseBtn);
        quantityControl.appendChild(quantitySpan);
        quantityControl.appendChild(increaseBtn);

        listItem.appendChild(itemText);
        listItem.appendChild(quantityControl);
        
        orderList.appendChild(listItem);
        totalPrice += item.quantity * item.sellPrice;
    });

    totalPriceEl.textContent = formatPrice(totalPrice);
}

function updateItemQuantity(index, change) {
    const item = currentOrderItems[index];
    item.quantity += change;

    if (item.quantity <= 0) {
        currentOrderItems.splice(index, 1);
    }
    
    displayCurrentOrder();
}

async function finalizeOrder() {
    const finalizeBtn = document.getElementById('finalize-order');
    finalizeBtn.disabled = true;

    if (currentOrderItems.length === 0) {
        alert('سفارش خالی است!');
        finalizeBtn.disabled = false;
        return;
    }

    const discount = parseFloat(document.getElementById('discount').value) || 0;
    const notes = document.getElementById('order-notes').value;
    
    // Recalculate total directly to avoid parsing issues with formatted strings
    let total = 0;
    currentOrderItems.forEach(item => {
        total += item.quantity * item.sellPrice;
    });

    const finalPrice = total - discount;

    const orderData = {
        items: currentOrderItems,
        total,
        discount,
        finalPrice,
        notes,
        timestamp: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
    };

    if (editOrderId) {
        orderData.id = editOrderId;
        await update('orders', orderData);
        alert('سفارش با موفقیت ویرایش شد.');
        window.location.href = 'orders.html'; // Redirect to orders list
    } else {
        await add('orders', orderData);
        alert('سفارش با موفقیت ثبت شد.');
    }

    // Reset form
    currentOrderItems = [];
    displayCurrentOrder();
    document.getElementById('discount').value = 0;
    document.getElementById('order-notes').value = '';
    editOrderId = null;
    document.querySelector('#order-section h2').textContent = 'ثبت سفارش جدید';
    finalizeBtn.textContent = 'نهایی کردن فیش';
    finalizeBtn.disabled = false;
}


// ===================================================================
// Orders List Page Logic
// ===================================================================
async function initOrdersListPage() {
    const exportBtn = document.getElementById('export-csv');
    if(exportBtn) {
        exportBtn.addEventListener('click', exportOrdersToCSV);
    }
    await displayOrders();
}

async function displayOrders() {
    const ordersTableBody = document.querySelector('#orders-table tbody');
    if (!ordersTableBody) return;

    const orders = await getAll('orders');
    orders.sort((a, b) => b.id - a.id); // Sort by ID descending
    ordersTableBody.innerHTML = '';
    orders.forEach(order => {
        const row = `
            <tr>
                <td data-label="شماره فیش">${order.id}</td>
                <td data-label="تاریخ و ساعت">${order.timestamp}</td>
                <td data-label="مبلغ کل">${formatPrice(order.total)}</td>
                <td data-label="تخفیف">${formatPrice(order.discount)}</td>
                <td data-label="مبلغ نهایی">${formatPrice(order.finalPrice)}</td>
                <td data-label="یادداشت">${order.notes || ''}</td>
                <td data-label="عملیات">
                    <button onclick="editOrder(${order.id})">ویرایش</button>
                    <button onclick="printOrder(${order.id})">چاپ</button>
                    <button onclick="deleteOrder(${order.id})">حذف</button>
                </td>
            </tr>
        `;
        ordersTableBody.innerHTML += row;
    });
}

async function deleteOrder(id) {
    if (confirm('آیا از حذف این فیش مطمئن هستید؟')) {
        await remove('orders', id);
        await displayOrders();
    }
}

// Print Order Functionality
async function printOrder(orderId) {
    const transaction = db.transaction(['orders', 'settings'], 'readonly');
    const ordersStore = transaction.objectStore('orders');
    const settingsStore = transaction.objectStore('settings');

    const orderRequest = ordersStore.get(orderId);
    const cafeNameRequest = settingsStore.get('cafeName');

    orderRequest.onsuccess = () => {
        const order = orderRequest.result;
        cafeNameRequest.onsuccess = () => {
            const cafeName = cafeNameRequest.result ? cafeNameRequest.result.value : 'کافه';
            
            let printContent = `
                <style>
                    body { font-family: sans-serif; direction: rtl; text-align: right; }
                    .receipt { width: 300px; margin: auto; padding: 15px; border: 1px solid #ccc; }
                    h2, p { margin: 5px 0; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { text-align: right; padding: 5px; border-bottom: 1px dotted #ccc; }
                </style>
                <div class="receipt">
                    <h2>${cafeName}</h2>
                    <p>شماره فیش: ${order.id}</p>
                    <p>تاریخ: ${order.timestamp}</p>
                    ${order.notes ? `<p>یادداشت: ${order.notes}</p>` : ''}
                    <hr>
                    <table>
                        <thead><tr><th>آیتم</th><th>تعداد</th><th>قیمت</th></tr></thead>
                        <tbody>
                            ${order.items.map(item => `
                                <tr>
                                    <td>${item.name}</td>
                                    <td>${item.quantity}</td>
                                    <td>${formatPrice(item.sellPrice * item.quantity)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <hr>
                    <p>جمع کل: ${formatPrice(order.total)} تومان</p>
                    <p>تخفیف: ${formatPrice(order.discount)} تومان</p>
                    <h3>مبلغ نهایی: ${formatPrice(order.finalPrice)} تومان</h3>
                </div>
            `;
            
            const printWindow = window.open('', '', 'height=600,width=800');
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.print();
        };
    };
}

function editOrder(id) {
    window.location.href = `index.html?editOrderId=${id}`;
}

async function exportOrdersToCSV() {
    const orders = await getAll('orders');
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Excel
    csvContent += "شماره فیش,تاریخ,جمع کل,تخفیف,مبلغ نهایی,آیتم ها,یادداشت\n";

    orders.forEach(order => {
        const itemsStr = order.items.map(i => `${i.name} (x${i.quantity})`).join('; ');
        const notes = order.notes || '';
        const row = [order.id, `"${order.timestamp}"`, order.total, order.discount, order.finalPrice, `"${itemsStr}"`, `"${notes}"`].join(',');
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "orders.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// ===================================================================
// Settings Page Logic
// ===================================================================
async function initSettingsPage() {
    const saveBtn = document.getElementById('save-settings');
    const cafeNameInput = document.getElementById('cafe-name');
    const exportBtn = document.getElementById('export-json');
    const importInput = document.getElementById('import-json');

    if (saveBtn) saveBtn.addEventListener('click', saveCafeSettings);
    if (exportBtn) exportBtn.addEventListener('click', exportData);
    if (importInput) importInput.addEventListener('change', importData);

    const cafeName = await getSetting('cafeName');
    if (cafeName && cafeNameInput) {
        cafeNameInput.value = cafeName;
    }
}

async function saveCafeSettings() {
    const cafeName = document.getElementById('cafe-name').value;
    await setSetting('cafeName', cafeName);
    alert('تنظیمات با موفقیت ذخیره شد.');
}

async function exportData() {
    const items = await getAll('items');
    const orders = await getAll('orders');
    const settings = await getAll('settings');

    const data = { items, orders, settings };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `cafe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (confirm('آیا مطمئن هستید؟ تمام داده‌های فعلی پاک شده و اطلاعات جدید جایگزین خواهد شد.')) {
                const transaction = db.transaction(['items', 'orders', 'settings'], 'readwrite');
                
                // Clear existing data
                await transaction.objectStore('items').clear();
                await transaction.objectStore('orders').clear();
                await transaction.objectStore('settings').clear();

                // Import new data
                if (data.items) data.items.forEach(item => transaction.objectStore('items').add(item));
                if (data.orders) data.orders.forEach(order => transaction.objectStore('orders').add(order));
                if (data.settings) data.settings.forEach(setting => transaction.objectStore('settings').add(setting));
                
                alert('اطلاعات با موفقیت بازیابی شد. صفحه مجددا بارگذاری می‌شود.');
                location.reload();
            }
        } catch (error) {
            alert('فایل پشتیبان معتبر نیست.');
            console.error("Import error:", error);
        }
    };
    reader.readAsText(file);
}
