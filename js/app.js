// js/app.js — navegación y efectos comunes (se carga en todas las páginas)
// El menú móvil lo maneja Bootstrap (data-bs-toggle="collapse"),
// aquí solo se marca el enlace de la página actual.
document.addEventListener("DOMContentLoaded", () => {
  const actual = location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll("#menu .nav-link").forEach((enlace) => {
    if (enlace.getAttribute("href") === actual) {
      enlace.classList.add("active");           // estilo definido en styles.css
      enlace.setAttribute("aria-current", "page");
    }
  });

  iniciarParallaxFondo();
});

function iniciarParallaxFondo() {
  if (!document.body.classList.contains("pagina-interna") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let actualizando = false;

  const actualizarPosicion = () => {
    document.body.style.backgroundPositionY = `${window.scrollY * 0.5}px`;
    actualizando = false;
  };

  window.addEventListener("scroll", () => {
    if (actualizando) return;
    actualizando = true;
    requestAnimationFrame(actualizarPosicion);
  }, { passive: true });

  actualizarPosicion();
}
