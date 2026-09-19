const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const canvas = document.getElementById('pad');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0, lastY = 0;
let isErasing = false;

resizeCanvas();

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseleave', () => isDrawing = false);
// 右键用于擦除, 阻止右键菜单
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDrawing = true;
    isErasing = (e.button === 2);
    [lastX, lastY] = [e.offsetX, e.offsetY];
});

// 绘画逻辑
canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    if (isErasing) {
        ctx.strokeStyle = isDark ? '#333' : '#fff';
        ctx.lineWidth = 20;
    } else {
        ctx.strokeStyle = isDark ? 'white' : 'black';
        ctx.lineWidth = 2;
    }

    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
});

// 动态设置画板大小
window.addEventListener('resize', resizeCanvas);

// 提示信息
document.addEventListener('DOMContentLoaded', async () => {
    const lang = await litebrowser.getLang();
    document.title = lang.tools.paint.title;
    const noteID = NoteMessage.showMessage('info', lang.tools.paint.info);
    setTimeout(() => NoteMessage.closeMessage(noteID), 2000);
});

// 保存到本地
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();

        // 铺背景色
        const bgCanvas = document.createElement('canvas');
        const bgctx = bgCanvas.getContext('2d');
        bgCanvas.width = canvas.width;
        bgCanvas.height = canvas.height;
        bgctx.fillStyle = isDark ? '#333' : '#fff';
        bgctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgctx.drawImage(canvas, 0, 0);

        // 下载图像
        const link = document.createElement('a');
        link.download = 'canvas-image.png';
        link.href = bgCanvas.toDataURL('image/png');
        link.click();
    }
});

// 设置画图板大小
function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width === width && canvas.height === height) return;

    // 备份原画布
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);

    // 还原画布
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(snapshot, 0, 0);
}