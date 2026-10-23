import type {APIRoute} from 'astro';
import {geogebraFrame} from '../../lib/geogebra.mjs';
export const GET:APIRoute=()=>new Response(geogebraFrame(null,''),{headers:{
 'Content-Type':'text/html; charset=utf-8',
 'Cache-Control':'no-store',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
}});
