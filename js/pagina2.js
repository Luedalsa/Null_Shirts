// js/pagina2.js — catálogo de productos y carrito de compras
import { Carrito } from "./carrito.js";
import { cargarProductos } from "./productos.js";

/* ========================================================================
   Interfaz (DOM)
   ======================================================================== */
const carrito = new Carrito();
let productos = [];

const $catalogo = document.getElementById("catalogo");
const $sinResultados = document.getElementById("sin-resultados");
const $buscador = document.getElementById("buscador");
const $filtroColor = document.getElementById("filtro-color");
const $orden = document.getElementById("orden");
const $contador = document.getElementById("contador-carrito");
const $estado = document.getElementById("estado-carrito");
const $aviso = document.getElementById("aviso");
const $avisoTexto = document.getElementById("aviso-texto");

function mostrarAviso(mensaje, ok) {
  $avisoTexto.textContent = mensaje;
  $aviso.classList.remove("text-bg-success", "text-bg-danger");
  $aviso.classList.add(ok ? "text-bg-success" : "text-bg-danger");
  bootstrap.Toast.getOrCreateInstance($aviso, { delay: 3000 }).show();
}

function actualizarContador() {
  const total = carrito.cantidadTotal();
  $contador.textContent = total;
  $estado.textContent = `Tu carrito tiene ${total} ${total === 1 ? "artículo" : "artículos"}.`;
}

// Refresca existencias y estado de los controles de una sola tarjeta
// (así no se pierden la talla y la cantidad que el usuario ya eligió en las demás)
function actualizarTarjeta(producto) {
  const tarjeta = document.getElementById(`producto-${producto.id}`);
  if (!tarjeta) return;

  const enCarrito = carrito.cantidadDe(producto.id);
  const disponible = producto.stock - enCarrito;
  const agotado = disponible <= 0;

  const $stock = tarjeta.querySelector("[data-stock]");
  if (producto.stock === 0) {
    $stock.textContent = "Sin existencias";
  } else if (agotado) {
    $stock.textContent = "Ya tienes todas las existencias en tu carrito";
  } else {
    $stock.textContent = `Quedan ${disponible}` + (enCarrito ? ` (ya tienes ${enCarrito} en tu carrito)` : "");
  }
  $stock.classList.toggle("text-danger", agotado || disponible <= 3);
  $stock.classList.toggle("text-success", !agotado && disponible > 3);

  tarjeta.querySelector("[data-agotado]").classList.toggle("d-none", !agotado);
  tarjeta.classList.toggle("producto-agotado", agotado);

  const $cantidad = tarjeta.querySelector("[data-cantidad]");
  $cantidad.max = Math.max(disponible, 1);
  if (!agotado && Number($cantidad.value) > disponible) $cantidad.value = disponible;
  $cantidad.disabled = agotado;

  tarjeta.querySelector("[data-talla]").disabled = agotado;

  const $boton = tarjeta.querySelector("[data-accion='agregar']");
  $boton.disabled = agotado;
  $boton.textContent = agotado ? "Agotado" : "Agregar al carrito";
}

// Aplica buscador, color y orden; vuelve a dibujar el catálogo
function mostrarCatalogo() {
  const texto = $buscador.value.trim().toLowerCase();
  const color = $filtroColor.value;

  let lista = productos.filter((p) =>
    (!texto || `${p.nombre} ${p.colorNombre}`.toLowerCase().includes(texto)) &&
    (!color || p.colorNombre === color)
  );

  switch ($orden.value) {
    case "precio-asc":  lista.sort((a, b) => a.precio - b.precio); break;
    case "precio-desc": lista.sort((a, b) => b.precio - a.precio); break;
    default:            lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  $catalogo.innerHTML = lista.map((p) => p.tarjeta()).join("");
  lista.forEach(actualizarTarjeta);
  $sinResultados.classList.toggle("d-none", lista.length > 0);
}

function llenarFiltroColor() {
  const colores = [...new Set(productos.map((p) => p.colorNombre))].sort((a, b) => a.localeCompare(b, "es"));
  $filtroColor.innerHTML =
    `<option value="">Todos</option>` + colores.map((c) => `<option value="${c}">${c}</option>`).join("");
}

// Si llegas desde "Ver más" del inicio (pagina2.html#producto-3), se resalta esa tarjeta
function resaltarDesdeHash() {
  if (!/^#producto-\d+$/.test(location.hash)) return;
  const tarjeta = document.querySelector(location.hash);
  if (!tarjeta) return;
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  tarjeta.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "center" });
  tarjeta.classList.add("resaltado");
  setTimeout(() => tarjeta.classList.remove("resaltado"), 2000);
}

/* ------------------------------------------------------------------------
   Eventos
   ------------------------------------------------------------------------ */
// Un solo listener para todos los botones "Agregar" (delegación de eventos)
$catalogo.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion='agregar']");
  if (!boton) return;

  const tarjeta = boton.closest("[data-id]");
  const producto = productos.find((p) => p.id === Number(tarjeta.dataset.id));
  const talla = tarjeta.querySelector("[data-talla]").value;
  const cantidad = Number(tarjeta.querySelector("[data-cantidad]").value);

  const resultado = carrito.agregar(producto, talla, cantidad);
  mostrarAviso(resultado.mensaje, resultado.ok);

  if (resultado.ok) {
    tarjeta.querySelector("[data-cantidad]").value = 1;
    actualizarTarjeta(producto);
    actualizarContador();
  }
});

$buscador.addEventListener("input", mostrarCatalogo);
$filtroColor.addEventListener("change", mostrarCatalogo);
$orden.addEventListener("change", mostrarCatalogo);

document.getElementById("limpiar-filtros").addEventListener("click", () => {
  $buscador.value = "";
  $filtroColor.value = "";
  $orden.value = "nombre";
  mostrarCatalogo();
});

// Si el carrito cambia en otra pestaña (o en pagina3.html), se sincroniza aquí
window.addEventListener("storage", (evento) => {
  if (evento.key !== Carrito.CLAVE) return;
  carrito.cargar();
  productos.forEach(actualizarTarjeta);
  actualizarContador();
});

/* ------------------------------------------------------------------------
   Inicio
   ------------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    productos = await cargarProductos();
  } catch (error) {
    console.error("No se pudieron cargar los productos:", error);
    $catalogo.innerHTML = `<p class="alert alert-danger">No pudimos cargar los productos. Recarga la página para intentar de nuevo.</p>`;
    return;
  }
  llenarFiltroColor();
  mostrarCatalogo();
  actualizarContador();
  resaltarDesdeHash();
});
