// ==========================================
// CONFIGURACIÓN SUPABASE (REEMPLAZAR CON TUS DATOS)
// ==========================================
const SUPABASE_URL = 'https://doyzequfqtdjtnldewhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXplcXVmcXRkanRubGRld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA4NTksImV4cCI6MjA5NzA1Njg1OX0.hBE_AwyEfKX1pF0rk2No3loAVAVJ6U6AjusAvjQTQmI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = null;
let currentRoutine = { exercises: [], totalTime: 0 };
let timerInterval = null;
let isPaused = true;
let queue = []; 
let currentQueueIndex = 0;
let timeLeftInPhase = 0;
let editIndex = -1;

// ==========================================
// FUNCIÓN DE BLOQUEO INTELIGENTE
// ==========================================
function toggleQuantity() {
    const equip = document.getElementById('ex-equipment');
    const qty = document.getElementById('ex-quantity');
    if (!equip || !qty) return;

    if (equip.value === 'Sin equipo') {
        qty.disabled = true;
        qty.value = '2'; 
    } else {
        qty.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const equipSelect = document.getElementById('ex-equipment');
    if (equipSelect) {
        equipSelect.addEventListener('change', toggleQuantity);
        toggleQuantity();
    }
});

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(error.message);
    currentUser = data.user;
    initApp();
}

async function register() {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!name) return showMessage('⚠️ Ingresa tu nombre.');
    
    const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { full_name: name } }
    });
    if (error) return showMessage('Error: ' + error.message);
    showMessage('✅ Registro exitoso. ¡Bienvenido ' + name + '!');
    currentUser = data.user;
    setTimeout(() => initApp(), 1500);
}

function showMessage(msg) { document.getElementById('auth-message').innerText = msg; }

function initApp() {
    showInterface('programmer-section');
    const userName = currentUser.user_metadata?.full_name || (currentUser.email ? currentUser.email.split('@')[0] : 'Atleta');
    speakRandomGreeting(userName);
}

// ==========================================
// 2. ASISTENTE DE VOZ
// ==========================================
const phrases = [
    "Bienvenido {name}, listo para sudar", "Vamos a romperla hoy, {name}", "El dolor es temporal, la gloria es eterna, {name}",
    "A darle con todo, {name}", "Tu único límite eres tú, {name}", "Hoy se construye el cuerpo del mañana, {name}",
    "No pares hasta estar orgulloso, {name}", "La disciplina vence al talento, {name}", "Suda ahora, brilla después, {name}",
    "Cada repetición cuenta, {name}", "Haz que cada segundo valga, {name}", "Tu cuerpo puede, convence a tu mente, {name}",
    "A entrenar se ha dicho, {name}", "Sin excusas, solo resultados, {name}", "La magia sucede fuera de tu zona de confort, {name}",
    "Convierte el dolor en poder, {name}", "Hoy es un buen día para ser fuerte, {name}", "El éxito es la suma de pequeños esfuerzos, {name}",
    "No cuentes los días, haz que los días cuenten, {name}", "Tu futuro te está esperando, {name}", "Dale duro, {name}",
    "La consistencia es la clave, {name}", "Supera tus límites, {name}", "Vamos a esculpir esa obra de arte, {name}"
];

function speakRandomGreeting(name) {
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)].replace('{name}', name);
    speak(randomPhrase, 1.1);
}

function speak(text, rate = 1.1) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Limpia la cola ANTES de hablar
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = rate;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 3. PROGRAMADOR DE RUTINAS
// ==========================================
function addExercise() {
    const nameEl = document.getElementById('ex-name');
    const qtyEl = document.getElementById('ex-quantity');
    if (!nameEl || !qtyEl) return alert("⚠️ Error de carga. Recarga la página (Ctrl + F5).");

    const ex = {
        name: nameEl.value,
        sets: parseInt(document.getElementById('ex-sets').value) || 1,
        reps: parseInt(document.getElementById('ex-reps').value) || 1,
        weight: document.getElementById('ex-weight').value,
        equipment: document.getElementById('ex-equipment').value,
        quantity: parseInt(qtyEl.value),
        tempo: {
            ecc: parseInt(document.getElementById('tempo-ecc').value) || 0,
            pb: parseInt(document.getElementById('tempo-pb').value) || 0,
            con: parseInt(document.getElementById('tempo-con').value) || 0,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0
        },
        rest: {
            set: parseInt(document.getElementById('rest-set').value) || 0,
            ex: parseInt(document.getElementById('rest-ex').value) || 0
        }
    };

    if (!ex.name) return alert('Ingresa un nombre de ejercicio');

    if (editIndex >= 0) {
        currentRoutine.exercises[editIndex] = ex;
        editIndex = -1;
        document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    } else {
        currentRoutine.exercises.push(ex);
    }

    calculateTotalTime();
    renderExerciseList();
    clearFormInputs();
}

function clearFormInputs() {
    document.getElementById('ex-name').value = '';
    document.getElementById('ex-sets').value = '';
    document.getElementById('ex-reps').value = '';
    document.getElementById('ex-weight').value = '';
    document.getElementById('ex-equipment').value = 'Sin equipo';
    document.getElementById('ex-quantity').value = '2';
    document.getElementById('tempo-ecc').value = '';
    document.getElementById('tempo-pb').value = '';
    document.getElementById('tempo-con').value = '';
    document.getElementById('tempo-pt').value = '';
    document.getElementById('rest-set').value = '';
    document.getElementById('rest-ex').value = '';
