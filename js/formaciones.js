const formaciones = {

home:{
nombre:"Jorge Newbery",

jugadores: [
    { nombre: "Sebastian Illesca" },
    { nombre: "Sebastian Dominguez" },
    { nombre: "Ignacio Peñas" },
    { nombre: "Kevin Caicedo" },
    { nombre: "Juan C. Cuevas" },
    { nombre: "Luciano Ramos", goles: 0, amarilla: false, roja: false },
    { nombre: "Cesar Medina" , goles: 3, amarilla: false, roja: false },
    { nombre: "Enzo Candia", goles: 0, amarilla: false, roja: false },
    { nombre: "Nicolas Ibañez" },
    { nombre: "Hector Cardozo" },
    { nombre: "Tobias Barrios" }
  ],
  suplentes: [
    { nombre: "Lucas Troya" },
    { nombre: "Braian Duché", goles: 0, amarilla: false, roja: false },
    { nombre: "Ignacio Siri" },
    { nombre: "Donato Herrero" },
    { nombre: "Juan C. Corral", goles: 0, amarilla: false, roja: false },
    { nombre: "Alejo Palacios" },
    { nombre: "Sergio Aranda" }
  ]
},

away:{
nombre:"Deportivo Maza",

jugadores: [
    { nombre: "Angel Arboleda", goles: 0, amarilla: true, roja: false },
    { nombre: "Francisco Alvarez" },
    { nombre: "Juan Labin" },
    { nombre: "Genaro Gertner" },
    { nombre: "Benjamin Fernandez" },
    { nombre: "Lucio Moggia", goles: 1, amarilla: true, roja: false },
    { nombre: "Sebastian Duckardt" , goles: 1, amarilla: false, roja: false },
    { nombre: "Jeremias Risso" },
    { nombre: "Angel Kowalsuk", roja: false },
    { nombre: "Santos Paturlanne" },
    { nombre: "Matias Rodi", roja: false }
  ],
  suplentes: [
    { nombre: "Cayetano Rivero" },
    { nombre: "Fernando Gonzalez" },
    { nombre: "Juan Diser" },
    { nombre: "Leonel Minor" },
    { nombre: "Juan Sanchez" },
    { nombre: "Leandro Alvarez" }
  ]

}

};



function renderRoster(teamKey, rosterId, titleId){

const team = formaciones[teamKey];

const container = document.getElementById(rosterId);
const title = document.getElementById(titleId);

if(!container || !title) return;

title.textContent = team.nombre;

container.innerHTML = "";

function crearJugador(j,numero,suplente=false){

const row = document.createElement("div");

row.className = `flex justify-between items-center py-1 border-b border-white/5 ${suplente ? "opacity-50 italic" : ""}`;

const nombre = document.createElement("span");

nombre.textContent = numero + ". " + j.nombre;

if(j.figura){
nombre.classList.add("font-bold","text-brandPurple");
}

const stats = document.createElement("div");

stats.className = "flex items-center gap-1";

if(j.goles){
stats.innerHTML += "⚽".repeat(j.goles);
}

if(j.amarilla){
stats.innerHTML += `<div class="w-3 h-4 bg-yellow-400 rounded-sm shadow-sm"></div>`;
}

if(j.roja){
stats.innerHTML += `<div class="w-3 h-4 bg-red-600 rounded-sm shadow-sm"></div>`;
}

row.appendChild(nombre);
row.appendChild(stats);

return row;

}



// TITULARES
team.jugadores.forEach((j,i)=>{

container.appendChild(crearJugador(j,i+1));

});



// SUPLENTES
team.suplentes.forEach((j,i)=>{

container.appendChild(crearJugador(j,i+12,true));

});

}



// RENDER INICIAL
document.addEventListener("DOMContentLoaded", () => {

renderRoster("home","home-roster","home-team");
renderRoster("away","away-roster","away-team");

});