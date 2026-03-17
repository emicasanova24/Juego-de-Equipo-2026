const formaciones = {

home:{
nombre:"Cecil A. Roberts",

jugadores:[
{nombre:"Fabricio Cerutti"},
{nombre:"Julian Cocimano"},
{nombre:"Emanuel Klundt"},
{nombre:"Luciano Duarte"},
{nombre:"Lucas Avellaneda"},
{nombre:"Julian Ressia", goles:0, amarilla:true, roja:false},
{nombre:"Joel Carrizo"},
{nombre:"Tomas Altamiranda", goles:1, amarilla:false, roja:false},
{nombre:"Lucas Rivas"},
{nombre:"Enzo Alonzo"},
{nombre:"Robert Campaz", goles:1, amarilla:false, roja:false},
],

suplentes:[
{nombre:"Enzo Pellegrini"},
{nombre:"Gaston Molina", goles:0, amarilla:true, roja:false},
{nombre:"Justin Gomez"},
{nombre:"Benjamin Natali"},
{nombre:"Luis Duche"},
{nombre:"Nahuel Mercadin"},
{nombre:"Maximiliano Seminth"}
]

},

away:{
nombre:"Unión de Bonifacio",

jugadores:[
{nombre:"Agustin Gomez"},
{nombre:"Agustin Duarte"},
{nombre:"Juan Feloy"},
{nombre:"Mariano Leiva"},
{nombre:"Francisco Ramirez"},
{nombre:"Felipe Borniego"},
{nombre:"Miche Fernandez"},
{nombre:"Yaco Leiva"},
{nombre:"Roman Aispuru", goles:0, amarilla:false, roja:true},
{nombre:"Juan Schafer"},
{nombre:"Denis Ramirez", goles:0, amarilla:false, roja:true},
],

suplentes:[
{nombre:"Felipe Cepeda"},
{nombre:"Julian Torres"},
{nombre:"Gonzalo Achaval"},
{nombre:"Santiago Satarain"},
{nombre:"Diego Achaval", goles:1, amarilla:false, roja:false},
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