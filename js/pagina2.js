// js/pagina2.js — catálogo de productos y carrito de compras
import { Carrito } from "./carrito.js";
import { cargarProductos, Productos } from "./productos.js";
import { obtenerPerfil } from "./perfil.js";
import { supabase } from "./supabase.js";

/* ========================================================================
   Interfaz (DOM)
   ======================================================================== */
const carrito = new Carrito();
let productos = [];
let esAdmin = false;

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
  // Para el administrador esta línea contiene el campo editable de stock: no se reescribe
  if (!esAdmin) {
    if (producto.stock === 0) {
      $stock.textContent = "Sin existencias";
    } else if (agotado) {
      $stock.textContent = "Ya tienes todas las existencias en tu carrito";
    } else {
      $stock.textContent = `Quedan ${disponible}` + (enCarrito ? ` (ya tienes ${enCarrito} en tu carrito)` : "");
    }
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

  // El administrador ve al final una tarjeta extra con "+" para crear una camiseta
  $catalogo.innerHTML =
    lista.map((p) => p.tarjeta(esAdmin)).join("") +
    (esAdmin ? Productos.tarjetaNueva() : "");
  lista.forEach(actualizarTarjeta);
  $sinResultados.classList.toggle("d-none", lista.length > 0);
}

function llenarFiltroColor() {
  const colores = [...new Set(productos.map((p) => p.colorNombre))].sort((a, b) => a.localeCompare(b, "es"));
  $filtroColor.innerHTML =
    `<option value="">Todos</option>` +
    colores.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join("");
}

// Los nombres de color pueden ser editados: se escapan antes de usarlos en innerHTML
const escapar = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

// Desplaza la vista a una tarjeta y la resalta un momento
function resaltarTarjeta(tarjeta) {
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  tarjeta.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "center" });
  tarjeta.classList.add("resaltado");
  setTimeout(() => tarjeta.classList.remove("resaltado"), 2000);
}

// Si llegas desde "Ver más" del inicio (pagina2.html#producto-3), se resalta esa tarjeta
function resaltarDesdeHash() {
  if (!/^#producto-\d+$/.test(location.hash)) return;
  const tarjeta = document.querySelector(location.hash);
  if (tarjeta) resaltarTarjeta(tarjeta);
}

/* ========================================================================
   Edición de productos (solo administradores)
   ======================================================================== */
const CAMPOS = {
  nombre:      { columna: "nombre",       tipo: "texto", max: 60,  obligatorio: true,  nombre: "El nombre" },
  descripcion: { columna: "descripcion",  tipo: "texto", max: 200, obligatorio: true,  nombre: "La descripción" },
  material:    { columna: "material",     tipo: "texto", max: 60,  obligatorio: true,  nombre: "El material" },
  colorNombre: { columna: "color_nombre", tipo: "texto", max: 30,  obligatorio: true,  nombre: "El nombre del color" },
  etiqueta:    { columna: "etiqueta",     tipo: "texto", max: 20,  obligatorio: false, nombre: "La etiqueta" },
  precio:      { columna: "precio",       tipo: "precio" },
  stock:       { columna: "stock",        tipo: "entero" },
  color:       { columna: "color",        tipo: "color" },
};

// Devuelve { valor } si es válido o { error } si no
function validarCampo(campo, crudo) {
  const reglas = CAMPOS[campo];
  const texto = String(crudo).trim();

  switch (reglas.tipo) {
    case "texto":
      if (reglas.obligatorio && !texto) return { error: `${reglas.nombre} no puede quedar vacío.` };
      if (texto.length > reglas.max) return { error: `${reglas.nombre} admite máximo ${reglas.max} caracteres.` };
      return { valor: texto };
    case "precio": {
      const n = Number(texto.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return { error: "El precio debe ser un número mayor a 0." };
      return { valor: Math.round(n * 100) / 100 };
    }
    case "entero": {
      const n = Number(texto);
      if (texto === "" || !Number.isInteger(n) || n < 0) {
        return { error: "El stock debe ser un número entero de 0 o más." };
      }
      return { valor: n };
    }
    case "color":
      return /^#[0-9a-f]{6}$/i.test(texto) ? { valor: texto.toLowerCase() } : { error: "Color no válido." };
  }
}

// Si RLS bloquea el UPDATE, Supabase no da error pero devuelve 0 filas: se detecta aquí
async function guardarCampo(producto, campo, valor) {
  const { data, error } = await supabase
    .from("productos")
    .update({ [CAMPOS[campo].columna]: valor })
    .eq("id", producto.id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Sin permiso para editar este producto.");
}

const leerCampo = (el) => (el.matches("input") ? el.value : el.textContent);
function escribirCampo(el, valor) {
  if (el.matches("input")) el.value = valor;
  else el.textContent = valor;
}

// Actualiza solo lo necesario de la tarjeta (sin redibujar, para no perder el foco ni la talla elegida)
function refrescarTarjetaEditada(tarjeta, producto, campo) {
  switch (campo) {
    case "color":
      tarjeta.querySelector("svg path").setAttribute("fill", producto.color);
      break;
    case "nombre":
      tarjeta.querySelector("svg").setAttribute("aria-label", `Camiseta ${producto.nombre}`);
      tarjeta.querySelector("[data-accion='agregar']")
        .setAttribute("aria-label", `Agregar ${producto.nombre} al carrito`);
      break;
    case "colorNombre": {
      const actual = $filtroColor.value;
      llenarFiltroColor();
      $filtroColor.value = [...$filtroColor.options].some((o) => o.value === actual) ? actual : "";
      break;
    }
    case "stock":
      actualizarTarjeta(producto);
      break;
  }
}

async function editarCampo(el) {
  const campo = el.dataset.campo;
  const tarjeta = el.closest("[data-id]");
  const producto = productos.find((p) => p.id === Number(tarjeta?.dataset.id));
  if (!producto || !CAMPOS[campo]) return;

  const resultado = validarCampo(campo, leerCampo(el));
  if (resultado.error) {
    escribirCampo(el, producto[campo]);
    if (campo === "color") tarjeta.querySelector("svg path").setAttribute("fill", producto.color);
    mostrarAviso(resultado.error, false);
    return;
  }

  escribirCampo(el, resultado.valor); // normaliza (espacios, decimales)
  if (resultado.valor === producto[campo]) return;

  const anterior = producto[campo];
  el.classList.add("campo-guardando");
  try {
    await guardarCampo(producto, campo, resultado.valor);
    producto[campo] = resultado.valor;
    refrescarTarjetaEditada(tarjeta, producto, campo);
    mostrarAviso("Producto actualizado.", true);
  } catch (error) {
    console.error("No se pudo guardar el cambio:", error);
    escribirCampo(el, anterior);
    if (campo === "color") tarjeta.querySelector("svg path").setAttribute("fill", anterior);
    mostrarAviso("No se pudo guardar el cambio. Revisa tu conexión o tus permisos.", false);
  } finally {
    el.classList.remove("campo-guardando");
  }
}

/* ========================================================================
   Creación de productos (solo administradores)
   ======================================================================== */
// Valores iniciales: cumplen las reglas de CAMPOS para que se puedan editar enseguida
const PRODUCTO_NUEVO = {
  nombre: "Nueva camiseta",
  descripcion: "Descripción de la camiseta",
  material: "Algodón 100%",
  precio: 199,
  color: "#cccccc",
  color_nombre: "Gris",
  stock: 10,
  etiqueta: "",
};

// Inserta la fila en Supabase (la política RLS de INSERT solo lo permite a admins)
async function crearProducto(boton) {
  boton.disabled = true;
  try {
    const { data, error } = await supabase
      .from("productos")
      .insert(PRODUCTO_NUEVO)
      .select()
      .single();
    if (error) throw error;

    const producto = new Productos({ ...data, colorNombre: data.color_nombre });
    productos.push(producto);

    // Se limpian los filtros para que la tarjeta nueva no quede oculta
    $buscador.value = "";
    $filtroColor.value = "";
    llenarFiltroColor();
    mostrarCatalogo();

    const tarjeta = document.getElementById(`producto-${producto.id}`);
    if (tarjeta) {
      resaltarTarjeta(tarjeta);
      tarjeta.querySelector("[data-campo='nombre']")?.focus({ preventScroll: true });
    }
    mostrarAviso("Camiseta creada. Edita sus datos directamente en la tarjeta.", true);
  } catch (error) {
    console.error("No se pudo crear la camiseta:", error);
    mostrarAviso("No se pudo crear la camiseta. Revisa tu conexión o tus permisos.", false);
  } finally {
    boton.disabled = false;
  }
}

async function cargarRol() {
  try {
    esAdmin = (await obtenerPerfil())?.rol === "admin";
  } catch (error) {
    console.warn("No se pudo leer el rol:", error);
    esAdmin = false;
  }
}

/* ------------------------------------------------------------------------
   Eventos
   ------------------------------------------------------------------------ */
// Un solo listener para los botones "Agregar" y "+" (delegación de eventos)
$catalogo.addEventListener("click", (evento) => {
  const crear = evento.target.closest("[data-accion='crear']");
  if (crear) {
    if (esAdmin) crearProducto(crear);
    return;
  }

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

// Edición (administrador): el texto se guarda al salir del campo. Enter confirma, Esc cancela.
$catalogo.addEventListener("focusout", (evento) => {
  const el = evento.target.closest?.("[data-campo]");
  if (esAdmin && el && el.isContentEditable) editarCampo(el);
});
$catalogo.addEventListener("keydown", (evento) => {
  const el = evento.target.closest?.("[data-campo]");
  if (!esAdmin || !el || !el.isContentEditable) return;
  if (evento.key === "Enter") {
    evento.preventDefault();
    el.blur();
  } else if (evento.key === "Escape") {
    const producto = productos.find((p) => p.id === Number(el.closest("[data-id]").dataset.id));
    escribirCampo(el, producto[el.dataset.campo]);
    el.blur();
  }
});
// Evita pegar saltos de línea o formato en los campos
$catalogo.addEventListener("paste", (evento) => {
  const el = evento.target.closest?.("[data-campo]");
  if (!el || !el.isContentEditable) return;
  evento.preventDefault();
  const texto = evento.clipboardData.getData("text/plain").replace(/\s+/g, " ");
  document.execCommand("insertText", false, texto);
});
// Color: se ve en vivo mientras eliges y se guarda al cerrar el selector
$catalogo.addEventListener("input", (evento) => {
  const el = evento.target;
  if (esAdmin && el.matches?.("input[data-campo='color']")) {
    el.closest(".producto-imagen").querySelector("svg path").setAttribute("fill", el.value);
  }
});
$catalogo.addEventListener("change", (evento) => {
  const el = evento.target;
  if (esAdmin && el.matches?.("input[data-campo='color']")) editarCampo(el);
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

// Al iniciar o cerrar sesión se redibuja el catálogo (setTimeout: no llamar a Supabase dentro del callback de auth)
supabase.auth.onAuthStateChange((evento) => {
  if (!["SIGNED_IN", "SIGNED_OUT"].includes(evento)) return;
  setTimeout(async () => {
    await cargarRol();
    if (productos.length) mostrarCatalogo();
  });
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
  await cargarRol();
  llenarFiltroColor();
  mostrarCatalogo();
  actualizarContador();
  resaltarDesdeHash();
});
