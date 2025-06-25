// Nhúng header/footer từ file riêng
function loadHtml(id, file) {
  fetch(file).then(res => res.text()).then(data => {
    document.getElementById(id).innerHTML = data;
  });
}
loadHtml('header', 'header.html');
loadHtml('footer', 'footer.html');

// Hiệu ứng sao rơi
const canvas = document.querySelector('.star-canvas');
const ctx = canvas.getContext('2d');
let w = window.innerWidth, h = window.innerHeight;
canvas.width = w; canvas.height = h;
window.addEventListener('resize', ()=>{w=window.innerWidth;h=window.innerHeight;canvas.width=w;canvas.height=h;});
let stars = [];
function newStar() {
  let speed = 3 + Math.random() * 2.5;
  return {
    x: Math.random() * w,
    y: -20,
    l: 90 + Math.random()*70,
    xs: speed,
    ys: speed * (0.3 + Math.random()*0.4),
    opacity: 0.55 + Math.random()*0.3,
    size: 1 + Math.random()*1.6
  };
}
function drawStars() {
  ctx.clearRect(0,0,w,h);
  for (let s of stars) {
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.l, s.y - s.l * 0.3);
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 7;
    ctx.stroke();
    ctx.restore();
  }
}
function updateStars() {
  for (let i=0;i<stars.length;i++) {
    stars[i].x += stars[i].xs;
    stars[i].y += stars[i].ys;
    stars[i].opacity -= 0.003;
    if (stars[i].y > h+30 || stars[i].opacity < 0) stars.splice(i,1), i--;
  }
  if (Math.random() < 0.09) stars.push(newStar());
}
function animate() {
  updateStars();
  drawStars();
  requestAnimationFrame(animate);
}
animate();
