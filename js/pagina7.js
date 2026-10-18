// js/pagina7.js — lealtad y eventos (Supabase)
// Tablas/funciones usadas: mi_lealtad(), niveles_lealtad, eventos, promociones, pedidos + pedido_items
import { supabase } from "./supabase.js";

/* ========================================================================
   Estado
   ======================================================================== */
let sesion = false;
let puntos = 0;                 // puntos del usuario (0 si no hay sesión)
let niveles = [];               // ordenados por puntos_min
let eventos = [];
let promociones = [];
let mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // mes que muestra el calendario

/* ========================================================================
   Referencias al DOM
   ======================================================================== */
const $lealtadInvitado = document.getElementById("lealtad-invitado");
const $lealtadUsuario = document.getElementById("lealtad-usuario");
const $nivelActual = document.getElementById("nivel-actual");
const $barraMarco = document.getElementById("barra-marco");
const $barra = document.getElementById("barra");
const $barraTexto = document.getElementById("barra-texto");
const $puntosTotal = document.getElementById("puntos-total");
const $comprasTotal = document.getElementById("compras-total");
const $gastadoTotal = document.getElementById("gastado-total");
const $listaNiveles = document.getElementById("lista-niveles");

const $calTitulo = document.getElementById("calendario-titulo");
const $calCuerpo = document.getElementById("calendario-cuerpo");
const $mesAnterior = document.getElementById("mes-anterior");
const $mesSiguiente = document.getElementById("mes-siguiente");
const $listaProximos = document.getElementById("lista-proximos");
const $proximosVacio = document.getElementById("proximos-vacio");

const $listaPromos = document.getElementById("lista-promos");
const $promosVacio = document.getElementById("promos-vacio");

const $historialInvitado = document.getElementById("historial-invitado");
const $historialVacio = document.getElementById("historial-vacio");
const $listaHistorial = document.getElementById("lista-historial");

const $modal = document.getElementById("modal-evento");
const $modalTitulo = document.getElementById("modal-evento-titulo");
const $modalCuerpo = document.getElementById("modal-evento-cuerpo");

const $aviso = document.getElementById("aviso");
const $avisoTexto = document.getElementById("aviso-texto");

/* ========================================================================
   Utilidades
   ======================================================================== */
const moneda = (n) => Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

// Los datos vienen de la BD: se escapan antes de meterlos en innerHTML
const escapar = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const fechaLarga = (iso) => new Date(iso).toLocaleDateString("es-MX", { dateStyle: "long" });
const fechaHora = (iso) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const hora = (iso) => new Date(iso).toLocaleTimeString("es-MX", { timeStyle: "short" });

// Clave "AAAA-MM-DD" en hora local, para agrupar eventos por día
const claveDia = (fecha) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

function mostrarAviso(mensaje, ok = true) {
  $avisoTexto.textContent = mensaje;
  $aviso.classList.remove("text-bg-success", "text-bg-danger");
  $aviso.classList.add(ok ? "text-bg-success" : "text-bg-danger");
  bootstrap.Toast.getOrCreateInstance($aviso, { delay: 3000 }).show();
}

const nivelPorId = (id) => niveles.find((n) => n.id === id);
const nivelBloqueado = (nivelMinId) => {
  const nivel = nivelPorId(nivelMinId);
  return Boolean(nivel) && nivel.puntos_min > puntos;
};

/* ========================================================================
   Niveles y progreso
   ======================================================================== */
function dibujarNiveles() {
  const actual = sesion
    ? [...niveles].reverse().find((n) => n.puntos_min <= puntos)
    : null;

  $listaNiveles.innerHTML = niveles.map((n) => {
    const esActual = actual?.id === n.id;
    const bloqueado = n.puntos_min > puntos;
    return `
      <li class="list-group-item nivel-item${esActual ? " nivel-actual" : ""}${bloqueado && sesion ? " nivel-bloqueado" : ""}"
          ${esActual ? 'aria-current="true"' : ""}>
        <div class="d-flex justify-content-between align-items-center">
          <span class="fw-semibold">${escapar(n.nombre)}</span>
          <span class="small text-secondary">${n.puntos_min} pts</span>
        </div>
        <p class="small text-secondary mb-0">${escapar(n.beneficio)}</p>
        ${esActual ? '<span class="badge text-bg-light mt-1">Tu nivel</span>' : ""}
      </li>`;
  }).join("");
}

function dibujarProgreso(datos) {
  if (!datos) {
    $lealtadUsuario.classList.add("d-none");
    $lealtadInvitado.classList.remove("d-none");
    return;
  }

  $lealtadInvitado.classList.add("d-none");
  $lealtadUsuario.classList.remove("d-none");

  $nivelActual.textContent = datos.nivel || "Sin nivel";
  $puntosTotal.textContent = datos.puntos_total;
  $comprasTotal.textContent = datos.compras;
  $gastadoTotal.textContent = moneda(datos.gastado);

  let porcentaje = 100;
  let texto = "¡Llegaste al nivel máximo!";

  if (datos.siguiente_nivel) {
    const tramo = datos.siguiente_puntos - (datos.nivel_puntos ?? 0);
    const avance = datos.puntos_total - (datos.nivel_puntos ?? 0);
    porcentaje = Math.max(0, Math.min(100, Math.round((avance / tramo) * 100)));
    const faltan = datos.siguiente_puntos - datos.puntos_total;
    texto = `Te faltan ${faltan} ${faltan === 1 ? "punto" : "puntos"} para el nivel ${datos.siguiente_nivel}.`;
  }

  $barra.style.width = `${porcentaje}%`;
  $barra.textContent = `${porcentaje}%`;
  $barraMarco.setAttribute("aria-valuenow", String(porcentaje));
  $barraTexto.textContent = texto;
}

async function cargarLealtad() {
  if (!sesion) {
    puntos = 0;
    dibujarProgreso(null);
    return;
  }
  const { data, error } = await supabase.rpc("mi_lealtad");
  if (error) throw error;
  const datos = data?.[0] ?? null;
  puntos = datos?.puntos_total ?? 0;
  dibujarProgreso(datos);
}

async function cargarNiveles() {
  const { data, error } = await supabase
    .from("niveles_lealtad")
    .select("id, nombre, puntos_min, beneficio")
    .order("puntos_min");
  if (error) throw error;
  niveles = data;
}

/* ========================================================================
   Calendario de eventos
   ======================================================================== */
function eventosPorDia() {
  const mapa = new Map();
  eventos.forEach((e) => {
    const clave = claveDia(new Date(e.inicio));
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(e);
  });
  return mapa;
}

function dibujarCalendario() {
  const anio = mes.getFullYear();
  const m = mes.getMonth();
  $calTitulo.textContent = mes.toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  const desfase = (new Date(anio, m, 1).getDay() + 6) % 7; // la semana empieza en lunes
  const diasMes = new Date(anio, m + 1, 0).getDate();
  const porDia = eventosPorDia();
  const hoy = claveDia(new Date());

  let html = "";
  let dia = 1 - desfase;

  while (dia <= diasMes) {
    html += "<tr>";
    for (let col = 0; col < 7; col++, dia++) {
      if (dia < 1 || dia > diasMes) {
        html += '<td class="bg-light"></td>';
        continue;
      }
      const fecha = new Date(anio, m, dia);
      const clave = claveDia(fecha);
      const lista = porDia.get(clave) || [];
      const clase = clave === hoy ? "dia-hoy" : "";

      if (lista.length) {
        const etiqueta = `${dia} de ${fecha.toLocaleDateString("es-MX", { month: "long" })}: ${lista.length} ${lista.length === 1 ? "evento" : "eventos"}`;
        html += `
          <td class="${clase}">
            <button type="button" class="dia-evento" data-dia="${clave}" aria-label="${escapar(etiqueta)}">
              <span class="num">${dia}</span>
              <span class="badge text-bg-dark">${lista.length}</span>
            </button>
          </td>`;
      } else {
        html += `<td class="${clase}"><span class="num">${dia}</span></td>`;
      }
    }
    html += "</tr>";
  }

  $calCuerpo.innerHTML = html;
}

function dibujarProximos() {
  const ahora = Date.now();
  const proximos = eventos
    .filter((e) => new Date(e.fin ?? e.inicio).getTime() >= ahora)
    .slice(0, 5);

  $proximosVacio.classList.toggle("d-none", proximos.length > 0);
  $listaProximos.innerHTML = proximos.map((e) => `
    <li>
      <button type="button" class="btn btn-outline-dark w-100 text-start" data-evento="${e.id}">
        <span class="d-block fw-semibold">${escapar(e.titulo)}</span>
        <span class="d-block small">${escapar(fechaHora(e.inicio))}</span>
      </button>
    </li>`).join("");
}

function htmlEvento(e) {
  const nivel = e.nivel_min_id ? nivelPorId(e.nivel_min_id) : null;
  const horario = e.fin ? `${hora(e.inicio)} a ${hora(e.fin)}` : hora(e.inicio);
  const producto = e.productos?.nombre;

  return `
    <article class="mb-4">
      <h3 class="h5 mb-1">${escapar(e.titulo)}</h3>
      <p class="small text-secondary mb-2">${escapar(fechaLarga(e.inicio))} · ${escapar(horario)}</p>
      ${e.lugar ? `<p class="mb-2"><strong>Lugar:</strong> ${escapar(e.lugar)}</p>` : ""}
      ${e.descripcion ? `<p class="mb-2">${escapar(e.descripcion)}</p>` : ""}
      ${producto ? `<p class="mb-2"><strong>Producto relacionado:</strong> ${escapar(producto)}</p>` : ""}
      ${nivel && nivel.puntos_min > 0
    ? `<span class="badge ${nivelBloqueado(nivel.id) ? "text-bg-secondary" : "text-bg-success"}">
             Nivel ${escapar(nivel.nombre)} o superior
           </span>`
    : '<span class="badge text-bg-light">Abierto a todos</span>'}
    </article>`;
}

function abrirEventos(lista, titulo) {
  $modalTitulo.textContent = titulo;
  $modalCuerpo.innerHTML = lista.map(htmlEvento).join("");
  bootstrap.Modal.getOrCreateInstance($modal).show();
}

async function cargarEventos() {
  const { data, error } = await supabase
    .from("eventos")
    .select("id, titulo, descripcion, lugar, inicio, fin, producto_id, nivel_min_id, productos(nombre)")
    .order("inicio");
  if (error) throw error;
  eventos = data;
  dibujarCalendario();
  dibujarProximos();
}

/* ========================================================================
   Promociones
   ======================================================================== */
function dibujarPromos() {
  $promosVacio.classList.toggle("d-none", promociones.length > 0);

  $listaPromos.innerHTML = promociones.map((p) => {
    const nivel = p.nivel_min_id ? nivelPorId(p.nivel_min_id) : null;
    const bloqueada = p.nivel_min_id ? nivelBloqueado(p.nivel_min_id) : false;
    const destino = p.producto_id ? `pagina2.html#producto-${p.producto_id}` : "pagina2.html";

    return `
      <div class="col-md-6 col-lg-4">
        <article class="card promo h-100${bloqueada ? " promo-bloqueada" : ""}">
          <div class="card-body d-flex flex-column">
            <p class="promo-descuento mb-2">-${p.descuento_pct}%</p>
            <h3 class="h5 card-title">${escapar(p.titulo)}</h3>
            <p class="small text-secondary mb-2">${escapar(p.descripcion)}</p>
            <p class="small mb-2">
              <strong>Aplica a:</strong> ${p.productos?.nombre ? escapar(p.productos.nombre) : "toda la tienda"}<br>
              <strong>Vigente hasta:</strong> ${escapar(fechaLarga(p.vigente_hasta))}
            </p>
            ${nivel && nivel.puntos_min > 0
      ? `<p class="mb-3"><span class="badge ${bloqueada ? "text-bg-secondary" : "text-bg-success"}">
                   ${bloqueada ? "Se desbloquea en" : "Disponible para"} nivel ${escapar(nivel.nombre)}
                 </span></p>`
      : '<p class="mb-3"><span class="badge text-bg-light">Para todos</span></p>'}
            <a href="${destino}" class="btn btn-outline-dark btn-sm mt-auto">Ver producto</a>
          </div>
        </article>
      </div>`;
  }).join("");
}

async function cargarPromos() {
  const { data, error } = await supabase
    .from("promociones")
    .select("id, titulo, descripcion, descuento_pct, producto_id, nivel_min_id, vigente_hasta, productos(nombre)")
    .order("vigente_hasta");
  if (error) throw error;
  promociones = data;
  dibujarPromos();
}

/* ========================================================================
   Historial de compras
   ======================================================================== */
async function cargarHistorial() {
  $historialInvitado.classList.toggle("d-none", sesion);
  if (!sesion) {
    $historialVacio.classList.add("d-none");
    $listaHistorial.innerHTML = "";
    return;
  }

  const { data, error } = await supabase
    .from("pedidos")
    .select("id, total, articulos, puntos, created_at, pedido_items(nombre, talla, cantidad, precio)")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  $historialVacio.classList.toggle("d-none", data.length > 0);
  $listaHistorial.innerHTML = data.map((p, i) => {
    const filas = p.pedido_items.map((it) => `
      <tr>
        <td>${escapar(it.nombre)} <span class="text-secondary small">(talla ${escapar(it.talla)})</span></td>
        <td class="text-center">${it.cantidad}</td>
        <td class="text-end">${moneda(it.precio * it.cantidad)}</td>
      </tr>`).join("");

    return `
      <div class="accordion-item">
        <h3 class="accordion-header">
          <button class="accordion-button${i === 0 ? "" : " collapsed"}" type="button" data-bs-toggle="collapse"
                  data-bs-target="#pedido-${p.id}" aria-expanded="${i === 0}" aria-controls="pedido-${p.id}">
            <span class="me-auto">Pedido #${p.id} · ${escapar(fechaLarga(p.created_at))}</span>
            <span class="badge text-bg-dark ms-2 me-2">+${p.puntos} pts</span>
            <span class="fw-semibold me-2">${moneda(p.total)}</span>
          </button>
        </h3>
        <div id="pedido-${p.id}" class="accordion-collapse collapse${i === 0 ? " show" : ""}">
          <div class="accordion-body">
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <caption class="visually-hidden">Artículos del pedido ${p.id}</caption>
                <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" class="text-center">Cantidad</th>
                  <th scope="col" class="text-end">Subtotal</th>
                </tr>
                </thead>
                <tbody>${filas}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ========================================================================
   Carga general
   ======================================================================== */
// Ejecuta una carga y, si falla, avisa sin tumbar el resto de la página
async function intentar(nombre, tarea) {
  try {
    await tarea();
  } catch (error) {
    console.error(`No se pudo cargar ${nombre}:`, error);
    mostrarAviso(`No pudimos cargar ${nombre}.`, false);
  }
}

// Lo que depende del usuario: puntos, niveles resaltados, promos bloqueadas, historial
async function cargarDatosDeUsuario() {
  const { data: { user } } = await supabase.auth.getUser();
  sesion = Boolean(user);

  await intentar("tu progreso", cargarLealtad);
  dibujarNiveles();
  dibujarPromos();
  dibujarProximos();
  await intentar("tus compras", cargarHistorial);
}

async function iniciar() {
  await intentar("los niveles", cargarNiveles);
  await Promise.all([
    intentar("los eventos", cargarEventos),
    intentar("las promociones", cargarPromos),
  ]);
  await cargarDatosDeUsuario();
}

/* ========================================================================
   Eventos
   ======================================================================== */
$mesAnterior.addEventListener("click", () => {
  mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  dibujarCalendario();
});
$mesSiguiente.addEventListener("click", () => {
  mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  dibujarCalendario();
});

// Clic en un día marcado: muestra los eventos de ese día (delegación de eventos)
$calCuerpo.addEventListener("click", (evento) => {
  const boton = evento.target.closest("button[data-dia]");
  if (!boton) return;
  const lista = eventos.filter((e) => claveDia(new Date(e.inicio)) === boton.dataset.dia);
  if (!lista.length) return;
  const [anio, m, d] = boton.dataset.dia.split("-").map(Number);
  abrirEventos(lista, new Date(anio, m - 1, d).toLocaleDateString("es-MX", { dateStyle: "full" }));
});

// Clic en un evento de "Próximos eventos"
$listaProximos.addEventListener("click", (evento) => {
  const boton = evento.target.closest("button[data-evento]");
  if (!boton) return;
  const encontrado = eventos.find((e) => String(e.id) === boton.dataset.evento);
  if (!encontrado) return;
  // El calendario salta al mes del evento para que se vea dónde cae
  const fecha = new Date(encontrado.inicio);
  mes = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  dibujarCalendario();
  abrirEventos([encontrado], encontrado.titulo);
});

// Al iniciar o cerrar sesión se recalcula todo lo personal
supabase.auth.onAuthStateChange((evento) => {
  if (["SIGNED_IN", "SIGNED_OUT"].includes(evento)) cargarDatosDeUsuario();
});

/* ========================================================================
   Inicio
   ======================================================================== */
iniciar();
