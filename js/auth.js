// js/auth.js — registro e inicio de sesión con Supabase Auth
// Dibuja en <ul id="auth-nav"> dos menús desplegables (Registrar / Login)
// y, si hay sesión, un menú con el nombre del usuario y "Cerrar sesión".
import { supabase } from "./supabase.js";
import { obtenerPerfil } from "./perfil.js"

const $nav = document.getElementById("auth-nav");

/* ========================================================================
   Utilidades
   ======================================================================== */
const escapar = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

// Traduce los errores más comunes de Supabase
function traducirError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirma tu correo antes de iniciar sesión.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese correo ya está registrado.";
  if (m.includes("password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("fetch") || m.includes("network")) return "No hay conexión con el servidor.";
  return "Ocurrió un error. Intenta de nuevo.";
}

function mostrarMensaje($caja, texto, ok = false) {
  $caja.textContent = texto;
  $caja.className = `alert py-2 small mb-3 ${ok ? "alert-success" : "alert-danger"}`;
}

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

/* ========================================================================
   Interfaz
   ======================================================================== */
function htmlInvitado() {
  return `
    <li class="nav-item dropdown">
      <button class="btn btn-outline-light dropdown-toggle me-xl-2 mb-2 mb-xl-0" type="button"
              data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
        Registrar
      </button>
      <div class="dropdown-menu dropdown-menu-xl-end p-3 menu-auth">
        <form id="form-registro" novalidate>
          <h2 class="h6 mb-3">Crear cuenta</h2>
          <div id="registro-msg" role="alert" class="d-none"></div>
          <div class="mb-2">
            <label for="reg-nombre" class="form-label small mb-1">Nombre</label>
            <input id="reg-nombre" type="text" class="form-control form-control-sm" maxlength="60" autocomplete="name" required>
          </div>
          <div class="mb-2">
            <label for="reg-correo" class="form-label small mb-1">Correo</label>
            <input id="reg-correo" type="email" class="form-control form-control-sm" autocomplete="email" required>
          </div>
          <div class="mb-2">
            <label for="reg-clave" class="form-label small mb-1">Contraseña (mín. 6)</label>
            <input id="reg-clave" type="password" class="form-control form-control-sm" minlength="6" autocomplete="new-password" required>
          </div>
          <div class="mb-3">
            <label for="reg-clave2" class="form-label small mb-1">Repite la contraseña</label>
            <input id="reg-clave2" type="password" class="form-control form-control-sm" autocomplete="new-password" required>
          </div>
          <button type="submit" class="btn btn-brand btn-sm w-100">Registrarme</button>
        </form>
      </div>
    </li>

    <li class="nav-item dropdown">
      <button class="btn btn-brand dropdown-toggle" type="button"
              data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
        Login
      </button>
      <div class="dropdown-menu dropdown-menu-xl-end p-3 menu-auth">
        <form id="form-login" novalidate>
          <h2 class="h6 mb-3">Iniciar sesión</h2>
          <div id="login-msg" role="alert" class="d-none"></div>
          <div class="mb-2">
            <label for="log-correo" class="form-label small mb-1">Correo</label>
            <input id="log-correo" type="email" class="form-control form-control-sm" autocomplete="email" required>
          </div>
          <div class="mb-3">
            <label for="log-clave" class="form-label small mb-1">Contraseña</label>
            <input id="log-clave" type="password" class="form-control form-control-sm" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-brand btn-sm w-100">Entrar</button>
        </form>
      </div>
    </li>`;
}

function htmlUsuario(perfil) {
  const rol = perfil.rol === "admin" ? "Administrador" : "Cliente";
  return `
    <li class="nav-item dropdown">
      <button class="btn btn-outline-light dropdown-toggle" type="button"
              data-bs-toggle="dropdown" aria-expanded="false">
        ${escapar(perfil.nombre)}
      </button>
      <ul class="dropdown-menu dropdown-menu-xl-end">
        <li><span class="dropdown-item-text small text-secondary">${escapar(perfil.correo)}<br>${rol}</span></li>
        <li><hr class="dropdown-divider"></li>
        <li><button id="btn-salir" type="button" class="dropdown-item">Cerrar sesión</button></li>
      </ul>
    </li>`;
}

async function dibujar() {
  let perfil = null;
  try {
    perfil = await obtenerPerfil();
  } catch (error) {
    console.warn("No se pudo leer la sesión:", error);
  }

  if (perfil) {
    $nav.innerHTML = htmlUsuario(perfil);
    document.getElementById("btn-salir").addEventListener("click", cerrarSesion);
    document.documentElement.dataset.rol = perfil.rol; // útil para CSS; la seguridad real va en la BD (RLS)
  } else {
    $nav.innerHTML = htmlInvitado();
    document.getElementById("form-registro").addEventListener("submit", registrar);
    document.getElementById("form-login").addEventListener("submit", iniciarSesion);
    delete document.documentElement.dataset.rol;
  }
}

/* ========================================================================
   Acciones
   ======================================================================== */
async function registrar(evento) {
  evento.preventDefault();
  const $msg = document.getElementById("registro-msg");
  const nombre = document.getElementById("reg-nombre").value.trim();
  const correo = document.getElementById("reg-correo").value.trim();
  const clave = document.getElementById("reg-clave").value;
  const clave2 = document.getElementById("reg-clave2").value;

  if (!nombre) return mostrarMensaje($msg, "Escribe tu nombre.");
  if (!correoValido(correo)) return mostrarMensaje($msg, "Escribe un correo válido.");
  if (clave.length < 6) return mostrarMensaje($msg, "La contraseña debe tener al menos 6 caracteres.");
  if (clave !== clave2) return mostrarMensaje($msg, "Las contraseñas no coinciden.");

  const boton = evento.submitter;
  boton.disabled = true;
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: clave,
    options: { data: { nombre } }, // el trigger de la BD lo copia a "perfiles"
  });
  boton.disabled = false;

  if (error) return mostrarMensaje($msg, traducirError(error));

  if (data.session) {
    // Confirmación de correo desactivada: ya inició sesión (onAuthStateChange redibuja)
    return;
  }
  // Si el correo ya existía, Supabase devuelve identities vacío en lugar de error
  if (data.user && data.user.identities?.length === 0) {
    return mostrarMensaje($msg, "Ese correo ya está registrado.");
  }
  mostrarMensaje($msg, "Cuenta creada. Revisa tu correo para confirmarla.", true);
  evento.target.reset();
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  const $msg = document.getElementById("login-msg");
  const correo = document.getElementById("log-correo").value.trim();
  const clave = document.getElementById("log-clave").value;

  if (!correoValido(correo) || !clave) return mostrarMensaje($msg, "Escribe tu correo y contraseña.");

  const boton = evento.submitter;
  boton.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
  boton.disabled = false;

  if (error) mostrarMensaje($msg, traducirError(error));
  // Si todo sale bien, onAuthStateChange redibuja la barra
}

async function cerrarSesion() {
  await supabase.auth.signOut();
}

/* ========================================================================
   Inicio
   ======================================================================== */
if ($nav) {
  dibujar();
  // Se dispara al iniciar/cerrar sesión (también desde otra pestaña)
  supabase.auth.onAuthStateChange((evento) => {
    if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(evento)) dibujar();
  });
}
