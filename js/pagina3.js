// js/pagina3.js — resumen del carrito de compras
import { Carrito } from "./carrito.js";
import { supabase } from "./supabase.js";

/* ========================================================================
   Datos de ejemplo (para probar o tomar capturas con el carrito lleno)
   ======================================================================== */
const EJEMPLO = [
  { id: 1, nombre: "Camiseta Clásica Naranja", precio: 249, color: "#e08524", talla: "M", cantidad: 2 },
  { id: 3, nombre: "Camiseta Azul Océano", precio: 259, color: "#2f6fb5", talla: "L", cantidad: 1 },
  { id: 6, nombre: "Camiseta Roja Carmín", precio: 259, color: "#c0392b", talla: "S", cantidad: 1 },
];

/* ========================================================================
   Utilidades
   ======================================================================== */
const moneda = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

// Los datos vienen de localStorage: se escapan antes de meterlos en innerHTML
const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const colorValido = (color) => (/^#[0-9a-f]{3,8}$/i.test(color) ? color : "#cccccc");

// Traduce los errores que lanza la función finalizar_compra() de la BD
function traducirErrorCompra(error) {
  const m = error?.message || "";
  if (m.includes("SIN_SESION")) return "Inicia sesión para finalizar tu compra.";
  if (m.includes("CARRITO_VACIO")) return "Tu carrito está vacío.";
  if (m.includes("STOCK_INSUFICIENTE")) {
    const nombre = m.split("STOCK_INSUFICIENTE:")[1]?.trim();
    return `Ya no hay existencias suficientes de ${nombre}. Ajusta tu carrito.`;
  }
  if (m.includes("PRODUCTO_NO_EXISTE")) return "Un producto de tu carrito ya no existe.";
  if (m.toLowerCase().includes("fetch") || m.toLowerCase().includes("network"))
    return "No hay conexión con el servidor.";
  return "No pudimos procesar tu compra. Intenta de nuevo.";
}

/* ========================================================================
   Interfaz (DOM)
   ======================================================================== */
const carrito = new Carrito();

const $vacio = document.getElementById("carrito-vacio");
const $contenido = document.getElementById("carrito-contenido");
const $lista = document.getElementById("lista-carrito");
const $articulos = document.getElementById("resumen-articulos");
const $total = document.getElementById("resumen-total");
const $finalizar = document.getElementById("btn-finalizar");
const $vaciar = document.getElementById("btn-vaciar");
const $ejemplo = document.getElementById("btn-ejemplo");
const $modal = document.getElementById("modal-compra");
const $modalResumen = document.getElementById("modal-resumen");
const $modalPuntos = document.getElementById("modal-puntos");
const $aviso = document.getElementById("aviso");
const $avisoTexto = document.getElementById("aviso-texto");

function mostrarAviso(mensaje, ok = true) {
  $avisoTexto.textContent = mensaje;
  $aviso.classList.remove("text-bg-success", "text-bg-danger");
  $aviso.classList.add(ok ? "text-bg-success" : "text-bg-danger");
  bootstrap.Toast.getOrCreateInstance($aviso, { delay: 3000 }).show();
}

function filaHTML(item) {
  const nombre = escapar(item.nombre);
  const talla = escapar(item.talla);
  const subtotal = item.precio * item.cantidad;

  return `
    <tr data-id="${item.id}" data-talla="${talla}">
      <td>
        <div class="miniatura" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <path d="M30 10 L10 25 L20 40 L28 35 L28 90 L72 90 L72 35 L80 40 L90 25 L70 10 Q50 24 30 10 Z"
                  fill="${colorValido(item.color)}" stroke="#212529" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
      </td>
      <th scope="row" class="fw-semibold">
        ${nombre}
        <span class="d-block small fw-normal text-secondary">Talla ${talla}</span>
      </th>
      <td class="text-end">${moneda(item.precio)}</td>
      <td class="text-center">${item.cantidad}</td>
      <td class="text-end fw-semibold">${moneda(subtotal)}</td>
      <td class="text-end">
        <button type="button" class="btn btn-outline-danger btn-sm" data-accion="quitar"
                aria-label="Quitar ${nombre} talla ${talla} del carrito">Quitar</button>
      </td>
    </tr>`;
}

// Vuelve a dibujar todo según lo que haya en el carrito
function mostrarCarrito() {
  const hay = carrito.items.length > 0;

  $vacio.classList.toggle("d-none", hay);
  $contenido.classList.toggle("d-none", !hay);

  $lista.innerHTML = carrito.items.map(filaHTML).join("");
  $articulos.textContent = carrito.cantidadTotal();
  $total.textContent = moneda(carrito.total());

  // El botón de finalizar solo se activa si hay artículos
  $finalizar.disabled = !hay;
  $vaciar.disabled = !hay;
}

/* ------------------------------------------------------------------------
   Eventos
   ------------------------------------------------------------------------ */
// Un solo listener para todos los botones "Quitar" (delegación de eventos)
$lista.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion='quitar']");
  if (!boton) return;

  const fila = boton.closest("tr");
  const id = Number(fila.dataset.id);
  const talla = fila.dataset.talla;
  const item = carrito.items.find((i) => i.id === id && i.talla === talla);

  carrito.quitar(id, talla);
  mostrarCarrito();
  if (item) mostrarAviso(`Quitaste ${item.nombre} (talla ${talla}) del carrito.`);
});

$vaciar.addEventListener("click", () => {
  if (!window.confirm("¿Quieres vaciar todo el carrito?")) return;
  carrito.vaciar();
  mostrarCarrito();
  mostrarAviso("Vaciaste el carrito.");
});

// Finalizar: registra la compra en Supabase (pedido, artículos, existencias y puntos).
// Todo se valida en la función finalizar_compra() de la BD; aquí solo se envía id, talla y cantidad.
$finalizar.addEventListener("click", async () => {
  carrito.cargar(); // por si el carrito cambió en otra pestaña

  if (carrito.items.length === 0) {
    mostrarCarrito();
    mostrarAviso("Tu carrito está vacío. Agrega una camiseta para continuar.", false);
    return;
  }

  $finalizar.disabled = true;
  $finalizar.textContent = "Procesando…";

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      mostrarAviso("Inicia sesión para finalizar tu compra.", false);
      return;
    }

    const items = carrito.items.map(({ id, talla, cantidad }) => ({ id, talla, cantidad }));
    const { data, error } = await supabase.rpc("finalizar_compra", { p_items: items });
    if (error) throw error;

    const compra = data[0];
    $modalResumen.textContent =
      `Compraste ${compra.o_articulos} ${compra.o_articulos === 1 ? "artículo" : "artículos"} por ${moneda(Number(compra.o_total))}.`;
    $modalPuntos.textContent = `Ganaste ${compra.o_puntos} puntos de lealtad.`;

    carrito.vaciar();
    bootstrap.Modal.getOrCreateInstance($modal).show();
  } catch (error) {
    console.error("No se pudo finalizar la compra:", error);
    mostrarAviso(traducirErrorCompra(error), false);
  } finally {
    $finalizar.textContent = "Finalizar compra";
    mostrarCarrito(); // reactiva o desactiva los botones según el carrito
  }
});

$ejemplo.addEventListener("click", () => {
  carrito.items = EJEMPLO.map((item) => ({ ...item }));
  carrito.guardar();
  mostrarCarrito();
});

// Si el carrito cambia en otra pestaña (o en pagina2.html), se sincroniza aquí
window.addEventListener("storage", (evento) => {
  if (evento.key !== Carrito.CLAVE) return;
  carrito.cargar();
  mostrarCarrito();
});

/* ------------------------------------------------------------------------
   Inicio
   ------------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", mostrarCarrito);
