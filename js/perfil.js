// js/perfil.js
import { supabase } from "./supabase.js";

export async function obtenerPerfil() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("perfiles").select("nombre, rol").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    correo: user.email,
    nombre: data?.nombre || user.user_metadata?.nombre || user.email,
    rol: data?.rol || "cliente",
  };
}
