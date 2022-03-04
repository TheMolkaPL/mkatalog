const togglerJsArray = document.getElementsByClassName('toggler-js');
for (let i = 0; i < togglerJsArray.length; i++) {
    registerElement(togglerJsArray.item(i));
}

function registerElement(element) {
    // icon
    const iconId = element.getAttribute('toggler-icon');
    const divId = element.getAttribute('toggler-div');

    if (typeof iconId == 'undefined') {
        return;
    } else if (typeof divId == 'undefined') {
        return;
    }

    const icon = document.getElementById(iconId);
    const div = document.getElementById(divId);

    if (typeof icon == 'undefined' || icon == '') {
        return;
    } else if (typeof div == 'undefined' || div == '') {
        return;
    }

    icon.className = 'bi bi-' + (div.style.display == 'none' ? 'plus' : 'dash');

    element.addEventListener('click', function(e) {
        if (div.style.display == 'none') {
            // show
            div.style.display = 'block';
            icon.className = 'bi bi-dash';
        } else {
            // hide
            div.style.display = 'none';
            icon.className = 'bi bi-plus';
        }
    });
}
