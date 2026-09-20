const infoDiv = document.getElementById('info');
const info = getUrlParams();
const message = {
    code: {
        info: 'Error Code: ',
        default: '-999'
    },
    desc: {
        info: 'Error Info: ',
        default: 'ERR_UNKNOWN_DISPLAY_ERROR'
    },
    time: {
        info: 'Time: ',
        default: new Date().toTimeString()
    },
    url: {
        info: 'Url: ',
        default: 'N/A'
    }
};

// 显示信息
['code', 'desc', 'time', 'url'].forEach(id => {
    const p = document.createElement('p');
    const a = document.createElement('a');
    const isEmpty = !info[id] || info[id].trim() === '';

    p.id = id;
    a.id = id + '-content';
    p.innerText = message[id].info;
    a.textContent = isEmpty ? message[id].default : info[id];

    p.appendChild(a);
    infoDiv.appendChild(p);
});


// 来自 https://github.com/YCL0609/YCL-Public-library
function getUrlParams(name) {
    const urlSearch = window.location.search;
    const params = new URLSearchParams(urlSearch);
    if (!name) {
        // 不传 name：返回所有参数的键值对对象
        const allParams = {};
        for (const [key, value] of params.entries()) {
            allParams[key] = value;
        }
        return allParams;
    } else {
        // 传入 name 返回特定参数的值
        const value = params.get(name);
        return value === null ? undefined : value; // 参数不存在时返回 undefined
    }
}