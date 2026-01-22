document.addEventListener('DOMContentLoaded', function() {
    console.log('DEBUG: Checking for duplicate connection status elements...');
    
    const elements = document.querySelectorAll('#connection-status');
    console.log('DEBUG: Found', elements.length, 'elements with id="connection-status"');
    elements.forEach((el, index) => {
        console.log(`DEBUG: Element ${index}:`, el.outerHTML);
        console.log(`DEBUG: Element ${index} parent:`, el.parentElement.outerHTML);
    });

    // Also check for class
    const byClass = document.querySelectorAll('.connection-status');
    console.log('DEBUG: Found', byClass.length, 'elements with class="connection-status"');
    byClass.forEach((el, index) => {
        console.log(`DEBUG: Element ${index}:`, el.outerHTML);
    });
    
    // Check if any elements are visually duplicated due to CSS
    const allOnlineText = document.querySelectorAll('*');
    let onlineCount = 0;
    allOnlineText.forEach(el => {
        if (el.textContent && el.textContent.includes('Online') && el.textContent.trim() === 'Online') {
            onlineCount++;
            console.log('DEBUG: Found "Online" text in:', el.tagName, el.className, el.id, el.outerHTML);
        }
    });
    console.log('DEBUG: Total elements containing "Online" text:', onlineCount);
});