// js/index.js — página de inicio: genera las tarjetas de "Destacados" con el DOM
import { cargarProductos } from "./productos.js";

// Ids de los productos que se muestran como destacados
const IDS_DESTACADOS = [1, 2, 3, 4, 5, 6, 7, 8];

function iniciarParticulas() {
  const canvas = document.querySelector(".particulas-canvas");
  const wrapper = canvas?.closest(".particulas-contenedor");
  if (!canvas || !wrapper) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const particles = [];
  const count = 100;
  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = wrapper.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  class Triangle {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : -20;
      this.size = 3 + Math.random() * 2;
      this.angle = Math.random() * Math.PI * 2;
      this.rotation = (Math.random() - 0.5) * 0.025;
      this.vx = (Math.random() - 0.5) * 5;
      this.vy = 5 + Math.random() * 0.8;
      this.opacity = 0.2 + Math.random() * 0.2;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.angle += this.rotation;

      if (this.y > height + 20) this.reset();
      if (this.x < -20) this.x = width + 20;
      if (this.x > width + 20) this.x = -20;
    }

    draw() {
      const size = this.size;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalAlpha = this.opacity;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.866, size * 0.5);
      ctx.lineTo(-size * 0.866, size * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#2c2f30";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.update();
      particle.draw();
    }
    requestAnimationFrame(drawFrame);
  }

  resize();
  for (let i = 0; i < count; i++) particles.push(new Triangle());
  window.addEventListener("resize", resize);
  drawFrame();
}

function iniciarFondoComoFunciona() {
  const section = document.querySelector(".como-funciona");
  if (!section || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let framePendiente = false;

  function actualizarPosicion() {
    framePendiente = false;
    const rect = section.getBoundingClientRect();
    const recorrido = window.innerHeight + rect.height;
    const progreso = (window.innerHeight - rect.top) / recorrido * -3;
    section.style.setProperty("--bg3-scroll-x", `${progreso * 180}px`);
  }

  function solicitarActualizacion() {
    if (framePendiente) return;
    framePendiente = true;
    window.requestAnimationFrame(actualizarPosicion);
  }

  solicitarActualizacion();
  window.addEventListener("scroll", solicitarActualizacion, { passive: true });
  window.addEventListener("resize", solicitarActualizacion);
}

document.addEventListener("DOMContentLoaded", async () => {
  iniciarParticulas();
  iniciarFondoComoFunciona();

  const contenedor = document.getElementById("destacados");
  if (!contenedor) return;

  try {
    const productos = await cargarProductos();
    const destacados = IDS_DESTACADOS
      .map((id) => productos.find((p) => p.id === id))
      .filter(Boolean);
    contenedor.innerHTML = destacados.map((p) => p.tarjetaDestacada()).join("");
  } catch (error) {
    console.error("No se pudieron cargar los destacados:", error);
    contenedor.innerHTML =
      `<p class="alert alert-danger">No pudimos cargar los destacados. Recarga la página.</p>`;
  }
});
