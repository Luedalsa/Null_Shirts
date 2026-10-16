// js/pagina5.js — boletín informativo y blog de comentarios (Supabase)
import { obtenerPerfil } from "./auth.js";
import { supabase } from "./supabase.js";

/* ========================================================================
   Constantes
   ======================================================================== */
const CLAVE_SUSCRIPTORES = "boletin-suscriptores";
const MIN_COMENTARIO = 5;
const MAX_COMENTARIO = 300;
const MAX_MOSTRADOS = 100;

/* ========================================================================
   Referencias al DOM
   ======================================================================== */
const $formBoletin = document.getElementById("form-boletin");
const $correo = document.getElementById("b-correo");
const $errorCorreo = document.getElementById("e-correo-boletin");
const $btnSuscribir = document.getElementById("btn-suscribir");
const $resultadoBoletin = document.getElementById("resultado-boletin");

const $formComentario = document.getElementById("form-comentario");
const $nombre = document.getElementById("cm-nombre");
const $texto = document.getElementById("cm-texto");
const $errorTexto = document.getElementById("e-texto");
const $contador = document.getElementById("contador-comentario");
const $comentarAs = document.getElementById("comentar-como");
const $btnComentar = document.getElementById("btn-comentar");
const $lista = document.getElementById("lista-comentarios");
const $vacio = document.getElementById("comentarios-vacio");
const $total = document.getElementById("total-comentarios");
const $borrarTodo = document.getElementById("btn-borrar-todo");

const $aviso = document.getElementById("aviso");
const $avisoTexto = document.getElementById("aviso-texto");

/* ========================================================================
   Utilidades
   ======================================================================== */
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

function mostrarAviso(mensaje, ok = true) {
  $avisoTexto.textContent = mensaje;
  $aviso.classList.remove("text-bg-success", "text-bg-danger");
  $aviso.classList.add(ok ? "text-bg-success" : "text-bg-danger");
  bootstrap.Toast.getOrCreateInstance($aviso, { delay: 3000 }).show();
}

function leerLista(clave) {
  try {
    const datos = JSON.parse(localStorage.getItem(clave));
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

// Devuelve false si el navegador bloquea el almacenamiento
function guardarLista(clave, lista) {
  try {
    localStorage.setItem(clave, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

function mostrarResultado($caja, texto, ok) {
  $caja.innerHTML = "";
  const alerta = document.createElement("div");
  alerta.className = `alert ${ok ? "alert-success" : "alert-danger"} mb-3`;
  alerta.textContent = texto; // textContent: nada del usuario se interpreta como HTML
  $caja.appendChild(alerta);
  $caja.focus();
}

/* ========================================================================
   Boletín
   ======================================================================== */
function errorCorreo(valor) {
  const v = valor.trim();
  if (!v) return "Escribe tu correo.";
  if (!correoValido(v)) return "Escribe un correo válido, por ejemplo nombre@correo.com.";
  return "";
}

function validarCorreo() {
  const error = errorCorreo($correo.value);
  $errorCorreo.textContent = error;
  $correo.classList.toggle("is-invalid", Boolean(error));
  $correo.classList.toggle("is-valid", !error);
  $correo.setAttribute("aria-invalid", error ? "true" : "false");
  return !error;
}

// Simula el envío con una promesa (aquí iría una llamada a la BD o a un servicio de correo)
const suscribir = (correo) =>
  new Promise((resolver) => setTimeout(() => resolver({ ok: true, correo }), 600));

async function alSuscribir(evento) {
  evento.preventDefault();

  if (!validarCorreo()) {
    $correo.focus();
    mostrarResultado($resultadoBoletin, "Revisa el correo marcado en rojo.", false);
    return;
  }

  const correo = $correo.value.trim().toLowerCase();
  const suscriptores = leerLista(CLAVE_SUSCRIPTORES);

  if (suscriptores.includes(correo)) {
    mostrarResultado($resultadoBoletin, "Ese correo ya está suscrito al boletín.", false);
    return;
  }

  $btnSuscribir.disabled = true;
  $btnSuscribir.textContent = "Enviando…";

  try {
    await suscribir(correo);
    suscriptores.push(correo);
    guardarLista(CLAVE_SUSCRIPTORES, suscriptores);
    mostrarResultado($resultadoBoletin, `¡Listo! ${correo} quedó suscrito al boletín.`, true);
    mostrarAviso("Suscripción exitosa.");
    $formBoletin.reset();
    $correo.classList.remove("is-valid", "is-invalid");
    $correo.removeAttribute("aria-invalid");
    $errorCorreo.textContent = "";
  } catch (error) {
    console.error("No se pudo suscribir:", error);
    mostrarResultado($resultadoBoletin, "No pudimos suscribirte. Intenta de nuevo.", false);
  } finally {
    $btnSuscribir.disabled = false;
    $btnSuscribir.textContent = "Suscribirme";
  }
}

/* ========================================================================
   Blog: comentarios (tabla "comentarios" en Supabase)
   ======================================================================== */
let comentarios = [];
let nombreSesion = ""; // nombre del usuario con sesión; vacío = anónimo
let usuarioId = null;  // id del usuario con sesión; null = sin sesión
let esAdmin = false;

function errorTexto(valor) {
  return valor.trim().length < MIN_COMENTARIO
    ? `El comentario debe tener al menos ${MIN_COMENTARIO} caracteres.`
    : "";
}

function validarTexto() {
  const error = errorTexto($texto.value);
  $errorTexto.textContent = error;
  $texto.classList.toggle("is-invalid", Boolean(error));
  $texto.classList.toggle("is-valid", !error);
  $texto.setAttribute("aria-invalid", error ? "true" : "false");
  return !error;
}

function actualizarContador() {
  $contador.textContent = `${$texto.value.length} / ${MAX_COMENTARIO}`;
}

function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

// Solo es comodidad de la interfaz: la seguridad real está en las políticas RLS
function puedeBorrar(c) {
  return esAdmin || (usuarioId !== null && c.usuario_id === usuarioId);
}

// Todo se arma con createElement/textContent: el texto del usuario nunca es HTML
function crearComentario(c, nuevo = false) {
  const li = document.createElement("li");
  li.className = `card comentario${nuevo ? " comentario-nuevo" : ""}`;

  const cuerpo = document.createElement("div");
  cuerpo.className = "card-body";

  const cabecera = document.createElement("div");
  cabecera.className = "d-flex align-items-center gap-2 mb-2";

  const avatar = document.createElement("div");
  avatar.className = "avatar-mini";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = c.nombre.charAt(0).toUpperCase();

  const datos = document.createElement("div");
  const autor = document.createElement("span");
  autor.className = "fw-semibold d-block";
  autor.textContent = c.nombre;
  const fecha = document.createElement("time");
  fecha.className = "small text-secondary";
  fecha.dateTime = c.created_at;
  fecha.textContent = formatearFecha(c.created_at);
  datos.append(autor, fecha);

  cabecera.append(avatar, datos);

  if (puedeBorrar(c)) {
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn btn-outline-danger btn-sm ms-auto";
    quitar.dataset.id = c.id;
    quitar.textContent = "Eliminar";
    quitar.setAttribute("aria-label", `Eliminar el comentario de ${c.nombre}`);
    cabecera.append(quitar);
  }

  const texto = document.createElement("p");
  texto.className = "comentario-texto mb-0";
  texto.textContent = c.texto;

  cuerpo.append(cabecera, texto);
  li.appendChild(cuerpo);
  return li;
}

function mostrarComentarios(idNuevo = null) {
  $lista.replaceChildren(...comentarios.map((c) => crearComentario(c, c.id === idNuevo)));
  $vacio.classList.toggle("d-none", comentarios.length > 0);
  $total.textContent = comentarios.length;
  $borrarTodo.classList.toggle("d-none", !esAdmin); // "Borrar todos" solo para admin
  $borrarTodo.disabled = comentarios.length === 0;
}

async function cargarComentarios() {
  const { data, error } = await supabase
    .from("comentarios")
    .select("id, usuario_id, nombre, texto, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_MOSTRADOS);

  if (error) {
    console.error("No se pudieron cargar los comentarios:", error);
    mostrarAviso("No pudimos cargar los comentarios.", false);
    return;
  }
  comentarios = data;
  mostrarComentarios();
}

async function alComentar(evento) {
  evento.preventDefault();

  if (!validarTexto()) {
    $texto.focus();
    return;
  }

  $btnComentar.disabled = true;
  const { data, error } = await supabase
    .from("comentarios")
    .insert({
      nombre: $nombre.value.trim() || nombreSesion || "Anónimo",
      texto: $texto.value.trim(),
      usuario_id: usuarioId, // null si no hay sesión
    })
    .select()
    .single();
  $btnComentar.disabled = false;

  if (error) {
    console.error("No se pudo publicar el comentario:", error);
    mostrarAviso("No pudimos publicar tu comentario. Intenta de nuevo.", false);
    return;
  }

  // El más reciente va primero
  comentarios = [data, ...comentarios].slice(0, MAX_MOSTRADOS);
  mostrarComentarios(data.id);
  mostrarAviso("Comentario publicado.");

  $texto.value = "";
  $texto.classList.remove("is-valid", "is-invalid");
  $texto.removeAttribute("aria-invalid");
  $errorTexto.textContent = "";
  actualizarContador();
}

async function eliminarComentario(id) {
  const { error } = await supabase.from("comentarios").delete().eq("id", id);
  if (error) {
    console.error("No se pudo eliminar el comentario:", error);
    mostrarAviso("No pudimos eliminar el comentario.", false);
    return;
  }
  comentarios = comentarios.filter((c) => c.id !== id);
  mostrarComentarios();
  mostrarAviso("Comentario eliminado.");
}

async function borrarTodos() {
  if (!window.confirm("¿Quieres borrar todos los comentarios?")) return;
  const { error } = await supabase.from("comentarios").delete().not("id", "is", null);
  if (error) {
    console.error("No se pudieron borrar los comentarios:", error);
    mostrarAviso("No pudimos borrar los comentarios.", false);
    return;
  }
  comentarios = [];
  mostrarComentarios();
  mostrarAviso("Borraste todos los comentarios.");
}

// Si hay sesión se usa su nombre, su id y su rol; si no, "Anónimo"
async function cargarSesion() {
  nombreSesion = "";
  usuarioId = null;
  esAdmin = false;
  try {
    const perfil = await obtenerPerfil();
    nombreSesion = perfil?.nombre || "";
    usuarioId = perfil?.id ?? null;
    esAdmin = perfil?.rol === "admin";
  } catch (error) {
    console.warn("No se pudo leer la sesión:", error);
  }
  $comentarAs.textContent = nombreSesion
    ? `Comentarás como ${nombreSesion} (puedes escribir otro nombre).`
    : "Si no escribes un nombre, tu comentario aparecerá como Anónimo.";
}

/* ========================================================================
   Eventos
   ======================================================================== */
$formBoletin.addEventListener("submit", alSuscribir);
$correo.addEventListener("blur", validarCorreo);
$correo.addEventListener("input", () => {
  if ($correo.classList.contains("is-invalid")) validarCorreo();
});

$formComentario.addEventListener("submit", alComentar);
$formComentario.addEventListener("reset", () => {
  // el reset del navegador ocurre después de este evento
  setTimeout(() => {
    $texto.classList.remove("is-valid", "is-invalid");
    $texto.removeAttribute("aria-invalid");
    $errorTexto.textContent = "";
    actualizarContador();
  });
});
$texto.addEventListener("blur", validarTexto);
$texto.addEventListener("input", () => {
  actualizarContador();
  if ($texto.classList.contains("is-invalid")) validarTexto();
});

// Un solo listener para todos los botones "Eliminar" (delegación de eventos)
$lista.addEventListener("click", (evento) => {
  const boton = evento.target.closest("button[data-id]");
  if (boton) eliminarComentario(boton.dataset.id);
});
$borrarTodo.addEventListener("click", borrarTodos);

// Al iniciar o cerrar sesión se actualizan los botones de borrar
supabase.auth.onAuthStateChange(async (evento) => {
  if (["SIGNED_IN", "SIGNED_OUT"].includes(evento)) {
    await cargarSesion();
    mostrarComentarios();
  }
});

/* ========================================================================
   Inicio
   ======================================================================== */
actualizarContador();
cargarSesion().then(cargarComentarios);
