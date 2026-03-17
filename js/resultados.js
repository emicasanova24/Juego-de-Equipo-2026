document.addEventListener("DOMContentLoaded", () => {

const logos = {
"Deportivo Garré": "equipos/logos/garre.png",
"Atlético Argentino": "equipos/logos/argentinos.png",
"Deportivo Maza": "equipos/logos/maza.png",
"El Ceibo": "equipos/logos/ceibo.png",
"Deportivo 17": "equipos/logos/17.png",
"Unión Deportiva": "equipos/logos/uniontl.png",
"Jorge Newbery": "equipos/logos/newbery.png",
"Juventud Unida": "equipos/logos/juventud.png",
"Atlético Quenuma": "equipos/logos/quenuma.png",
"Villa del Parque": "equipos/logos/villa.png",
"Salazar FC": "equipos/logos/salazar.png",
"Unión de Bonifacio": "equipos/logos/bonifacio.png",
"Deportivo Argentino": "equipos/logos/deportivoarg.png",
"Cecil A. Roberts": "equipos/logos/roberts.png",
"La Gloria": "equipos/logos/lagloria.png"
}

const partidos = document.querySelectorAll('[data-purpose="results-section"] .grid > div')

partidos.forEach(partido => {

const spans = partido.querySelectorAll("span")

// PARTIDOS NORMALES
if(spans.length === 3){

const local = spans[0]
const visitante = spans[2]

const nombreLocal = local.textContent.trim()
const nombreVisitante = visitante.textContent.trim()

// LOGO LOCAL
if(logos[nombreLocal]){
const img = document.createElement("img")
img.src = logos[nombreLocal]
img.style.height = "18px"
img.style.marginRight = "6px"

local.classList.add("flex","items-center")
local.prepend(img)
}

// LOGO VISITANTE
if(logos[nombreVisitante]){
const img = document.createElement("img")
img.src = logos[nombreVisitante]
img.style.height = "18px"
img.style.marginLeft = "6px"

visitante.classList.add("flex","items-center","justify-end")
visitante.appendChild(img)
}

}

// EQUIPO LIBRE
if(spans.length === 1){

const equipo = spans[0]
const nombre = equipo.textContent.trim()

if(logos[nombre]){
const img = document.createElement("img")
img.src = logos[nombre]
img.style.height = "18px"
img.style.marginRight = "6px"

equipo.classList.add("flex","items-center","justify-center")
equipo.prepend(img)
}

}

})

})