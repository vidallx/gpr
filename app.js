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
let currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
let timerInterval = null;
let isPaused = true;
let queue = [];
let currentQueueIndex = 0;
let timeLeftInPhase = 0;
let editIndex = -1;
let currentScheduledDay = 'Lunes';
let allHistoryData = []; // 🆕 Para filtros

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
    const daySelect = document.getElementById('routine-day');
    if (daySelect) {
        daySelect.addEventListener('change', handleDayChange);
        setDefaultDay();
    }
});

function setDefaultDay() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = days[new Date().getDay()];
    const daySelect = document.getElementById('routine-day');
    if (daySelect) {
        daySelect.value = today;
        currentScheduledDay = today;
        loadRoutineForDay(today);
    }
}

function handleDayChange() {
    const selectedDay = document.getElementById('routine-day').value;
    if (currentRoutine.exercises.length > 0) {
        if (!confirm(`Tienes una rutina en edición. ¿Deseas cargar la rutina del ${selectedDay}? (Los cambios no guardados se perderán)`)) {
            document.getElementById('routine-day').value = currentScheduledDay;
            return;
        }
    }
    currentScheduledDay = selectedDay;
    loadRoutineForDay(selectedDay);
}

function loadRoutineForDay(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const routine = allRoutines[day];
    if (routine) {
        currentRoutine = JSON.parse(JSON.stringify(routine));
        renderExerciseList();
        document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
        document.getElementById('body-part').value = routine.bodyPart || 'Full Body';
        document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises || 0) / 60);
        updateDayInfo(day, true);
    } else {
        currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
        clearFormInputs();
        updateDayInfo(day, false);
    }
}

function updateDayInfo(day, hasRoutine) {
    const info = document.getElementById('routine-day-info');
    if (!info) return;
    if (hasRoutine) {
        info.innerHTML = `✅ Ya tienes una rutina programada para <strong>${day}</strong> con ${currentRoutine.exercises.length} ejercicio(s).`;
        info.style.color = '#28a745';
    } else {
        info.innerHTML = `ℹ️ No hay rutina programada para <strong>${day}</strong>. Crea una nueva.`;
        info.style.color = '#666';
    }
}

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(error.message, 'auth-message');
    currentUser = data.user;
    initApp();
}

async function register() {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (!name) return showMessage('⚠️ Ingresa tu nombre.', 'register-message');
    if (!email || !password) return showMessage('⚠️ Completa todos los campos.', 'register-message');
    if (password.length < 6) return showMessage('⚠️ La contraseña debe tener al menos 6 caracteres.', 'register-message');
    if (password !== passwordConfirm) return showMessage('⚠️ Las contraseñas no coinciden.', 'register-message');

    showMessage('Creando cuenta...', 'register-message');
    const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { full_name: name } }
    });
    if (error) return showMessage('Error: ' + error.message, 'register-message');
    showMessage('✅ ¡Cuenta creada! Redirigiendo...', 'register-message');
    currentUser = data.user;
    setTimeout(() => initApp(), 1500);
}

async function resetPassword() {
    const email = document.getElementById('login-email').value;
    if (!email) return showMessage('⚠️ Escribe tu correo antes de solicitar recuperación.', 'auth-message');
    showMessage('Enviando enlace...', 'auth-message');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) showMessage('Error: ' + error.message, 'auth-message');
    else showMessage('✅ Enlace enviado a tu correo.', 'auth-message');
}

function showMessage(msg, elementId = 'auth-message') {
    const el = document.getElementById(elementId);
    if (el) el.innerText = msg;
}

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

const motivationPhrases = [
    "Adelante, tú puedes", "No olvides hidratarte", "Mantén la concentración",
    "Cada repetición te hace más fuerte", "El esfuerzo de hoy es el éxito de mañana",
    "Respira hondo y sigue", "Tu cuerpo es capaz de más de lo que imaginas",
    "No te rindas, estás cerca", "La constancia es tu mejor aliada",
    "Siente el poder de tu esfuerzo", "Un paso a la vez, sigue adelante",
    "Tu disciplina construye tu futuro", "Confía en el proceso",
    "Eres más fuerte de lo que crees", "El sacrificio de hoy es la victoria de mañana",
    "Sigue empujando, el resultado vale la pena"
];

function speakRandomGreeting(name) {
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)].replace('{name}', name);
    speak(randomPhrase, 1.1);
}

function getRandomMotivationPhrase() {
    return motivationPhrases[Math.floor(Math.random() * motivationPhrases.length)];
}

function speak(text, rate = 1.1) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
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
            set: parseInt(document.getElementById('rest-set').value) || 0
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
    clearExerciseInputs();
}

function clearExerciseInputs() {
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
    toggleQuantity();
}

function clearFormInputs() {
    clearExerciseInputs();
    document.getElementById('rest-ex-global').value = '';
}

function editExercise(index) {
    const ex = currentRoutine.exercises[index];
    editIndex = index;
    document.getElementById('ex-name').value = ex.name;
    document.getElementById('ex-sets').value = ex.sets;
    document.getElementById('ex-reps').value = ex.reps;
    document.getElementById('ex-weight').value = ex.weight;
    document.getElementById('ex-equipment').value = ex.equipment;
    document.getElementById('ex-quantity').value = ex.quantity;
    document.getElementById('tempo-ecc').value = ex.tempo.ecc;
    document.getElementById('tempo-pb').value = ex.tempo.pb;
    document.getElementById('tempo-con').value = ex.tempo.con;
    document.getElementById('tempo-pt').value = ex.tempo.pt;
    document.getElementById('rest-set').value = ex.rest.set;
    toggleQuantity();
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Guardar Cambios';
    window.scrollTo(0, 0);
}

function deleteExercise(index) {
    currentRoutine.exercises.splice(index, 1);
    editIndex = -1;
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    calculateTotalTime();
    renderExerciseList();
}

// 🆕 CÁLCULO CON DESCANSO GLOBAL EN MINUTOS
function calculateTotalTime() {
    let totalSeconds = 40;
    const restExMinutes = parseInt(document.getElementById('rest-ex-global').value) || 0;
    const restExSeconds = restExMinutes * 60;

    currentRoutine.exercises.forEach((ex, idx) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;

        for (let s = 1; s <= ex.sets; s++) {
            if (isUnilateral) {
                totalSeconds += (repCycle * ex.reps);
                totalSeconds += 8;
                totalSeconds += (repCycle * ex.reps);
            } else {
                totalSeconds += (repCycle * ex.reps);
            }
            if (s < ex.sets) totalSeconds += ex.rest.set;
        }

        // Descanso global entre ejercicios (solo si no es el último)
        if (idx < currentRoutine.exercises.length - 1) {
            totalSeconds += restExSeconds;
        }
    });

    currentRoutine.totalTime = totalSeconds;
    currentRoutine.restBetweenExercises = restExSeconds;
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderExerciseList() {
    const list = document.getElementById('exercise-list');
    list.innerHTML = currentRoutine.exercises.map((ex, i) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const note = isUnilateral ? ` (${ex.reps} reps Izq → 8s → ${ex.reps} reps Der) x ${ex.sets} series` : '';
        return `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #ddd;">
            <div>
                <strong>${i+1}. ${ex.name}</strong> ${note}<br>
                <small>${ex.sets} series x ${ex.reps} reps | ${ex.equipment} (Cant: ${ex.quantity})</small>
            </div>
            <div>
                <button onclick="editExercise(${i})" style="width: auto; padding: 5px 10px; font-size: 12px; margin: 0 5px; background: #ffc107; color: #000; border: none; border-radius: 5px; cursor: pointer;">✏️</button>
                <button onclick="deleteExercise(${i})" style="width: auto; padding: 5px 10px; font-size: 12px; margin: 0; background: #ff4444; color: #fff; border: none; border-radius: 5px; cursor: pointer;">🗑️</button>
            </div>
        </li>`;
    }).join('');
}

function saveRoutineToStorage() {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    currentRoutine.restBetweenExercises = (parseInt(document.getElementById('rest-ex-global').value) || 0) * 60;
    allRoutines[currentScheduledDay] = {
        ...JSON.parse(JSON.stringify(currentRoutine)),
        bodyPart: document.getElementById('body-part').value,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
}

function saveRoutineOnly() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio antes de guardar');
    saveRoutineToStorage();
    updateDayInfo(currentScheduledDay, true);
    alert(`✅ Rutina guardada para el ${currentScheduledDay}.`);
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    saveRoutineToStorage();
    localStorage.setItem('pending_routine', JSON.stringify(currentRoutine));
    buildTimerQueue();
    showInterface('executor-section');
    speak("Dispondrás de 40 segundos para prepararte", 1.1);
}

function showScheduledRoutines() {
    showInterface('scheduled-routines-section');
    renderScheduledRoutines();
}

function renderScheduledRoutines() {
    const container = document.getElementById('scheduled-routines-list');
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let html = '';
    days.forEach(day => {
        const routine = allRoutines[day];
        const isToday = day === getCurrentDayName();
        const todayBadge = isToday ? ' <span style="background: #C23D55; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">HOY</span>' : '';
        if (routine) {
            const exercisesList = routine.exercises.map(e => e.name).join(', ');
            html += `
                <div style="background: ${isToday ? '#e8f5e9' : '#f8f9fa'}; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 4px solid ${isToday ? '#28a745' : '#0C047D'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 5px;">
                        <h3 style="margin: 0; color: #0C047D;">${day}${todayBadge}</h3>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="loadAndStartRoutine('${day}')" style="padding: 5px 10px; font-size: 12px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">▶</button>
                            <button onclick="editScheduledRoutine('${day}')" style="padding: 5px 10px; font-size: 12px; background: #ffc107; color: #000; border: none; border-radius: 5px; cursor: pointer;">✏️</button>
                            <button onclick="deleteScheduledRoutine('${day}')" style="padding: 5px 10px; font-size: 12px; background: #ff4444; color: white; border: none; border-radius: 5px; cursor: pointer;">🗑️</button>
                        </div>
                    </div>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>${routine.bodyPart || 'Full Body'}</strong> | ⏱️ ${formatTime(routine.totalTime)}</p>
                    <p style="margin: 5px 0; font-size: 12px; color: #888;"><small>${exercisesList}</small></p>
                </div>
            `;
        } else {
            html += `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 4px solid #ccc; opacity: 0.7;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #999;">${day}${todayBadge}</h3>
                        <button onclick="createRoutineForDay('${day}')" style="padding: 5px 12px; font-size: 12px; background: #0C047D; color: white; border: none; border-radius: 5px; cursor: pointer;">+ Crear</button>
                    </div>
                    <p style="margin: 5px 0; font-size: 12px; color: #999;">Sin rutina programada</p>
                </div>
            `;
        }
    });
    container.innerHTML = html;
}

function getCurrentDayName() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[new Date().getDay()];
}

function loadAndStartRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const routine = allRoutines[day];
    if (!routine) return alert('No hay rutina para este día');
    currentRoutine = JSON.parse(JSON.stringify(routine));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = routine.bodyPart || 'Full Body';
    saveAndStartRoutine();
}

function editScheduledRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const routine = allRoutines[day];
    if (!routine) return;
    currentRoutine = JSON.parse(JSON.stringify(routine));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = routine.bodyPart || 'Full Body';
    document.getElementById('rest-ex-global').value = Math.floor((routine.restBetweenExercises || 0) / 60);
    renderExerciseList();
    document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
    updateDayInfo(day, true);
    showInterface('programmer-section');
}

function createRoutineForDay(day) {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    clearFormInputs();
    updateDayInfo(day, false);
    showInterface('programmer-section');
}

function deleteScheduledRoutine(day) {
    if (!confirm(`¿Eliminar la rutina del ${day}?`)) return;
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    delete allRoutines[day];
    localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
    if (day === currentScheduledDay) {
        currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
        clearFormInputs();
        document.getElementById('total-time-display').innerText = '00:00';
        document.getElementById('exercise-list').innerHTML = '';
        updateDayInfo(day, false);
    }
    renderScheduledRoutines();
}

// ==========================================
// 4. EJECUTOR (CRONOMETRAJE Y AUDIO)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    if (type === 'metronome') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'square'; osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'eccentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.5);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'concentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'pause-bottom') {
        playDoubleBeep(now);
    } else if (type === 'pause-top') {
        playTripleBeep(now);
    } else if (type === 'transition') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

function playDoubleBeep(time) {
    const osc1 = audioCtx.createOscillator(); const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
    osc1.connect(gain1); osc2.connect(gain2); gain1.connect(audioCtx.destination); gain2.connect(audioCtx.destination);
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(600, time); gain1.gain.setValueAtTime(0.3, time); gain1.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc1.start(time); osc1.stop(time + 0.1);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(600, time + 0.2); gain2.gain.setValueAtTime(0.3, time + 0.2); gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc2.start(time + 0.2); osc2.stop(time + 0.3);
}

function playTripleBeep(time) {
    for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, time + (i * 0.15));
        gain.gain.setValueAtTime(0.2, time + (i * 0.15)); gain.gain.exponentialRampToValueAtTime(0.01, time + (i * 0.15) + 0.08);
        osc.start(time + (i * 0.15)); osc.stop(time + (i * 0.15) + 0.08);
    }
}

function buildTimerQueue() {
    queue = [];
    queue.push({ phase: 'Preparación', duration: 40, action: 'prep' });
    const totalExercises = currentRoutine.exercises.length;
    const restExSeconds = currentRoutine.restBetweenExercises || 0;

    currentRoutine.exercises.forEach((ex, exIndex) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const nextExName = currentRoutine.exercises[exIndex + 1] ? currentRoutine.exercises[exIndex + 1].name : "el final de tu rutina";
        const isLastTwoExercises = (exIndex >= totalExercises - 2);

        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                const phases = [];
                if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                if (ex.tempo.con > 0) phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });

                phases.forEach((p, idx) => {
                    queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, totalReps: ex.reps, totalSets: ex.sets, sideLabel: isUnilateral ? "Izquierda" : "", blockSide: isUnilateral ? "left" : null, isFirstPhaseOfRep: (idx === 0), isUnilateral: isUnilateral });
                });
            }

            if (isUnilateral) {
                queue.push({ phase: 'Transición', duration: 8, action: 'rest-trans', exerciseName: ex.name, setNumber: s, totalSets: ex.sets, nextSide: "Derecha", isUnilateral: true });
                for (let r = 1; r <= ex.reps; r++) {
                    const phases = [];
                    if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                    if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                    if (ex.tempo.con > 0) phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                    if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });
                    phases.forEach((p, idx) => {
                        queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, totalReps: ex.reps, totalSets: ex.sets, sideLabel: "Derecha", blockSide: "right", isFirstPhaseOfRep: (idx === 0), isUnilateral: true });
                    });
                }
            }

            if (s < ex.sets) {
                queue.push({ phase: 'Descanso entre series', duration: ex.rest.set, action: 'rest', exerciseName: ex.name, setNumber: s, totalSets: ex.sets });
            }
        }

        // Descanso global entre ejercicios
        if (exIndex < currentRoutine.exercises.length - 1 && restExSeconds > 0) {
            queue.push({ phase: 'Descanso entre ejercicios', duration: restExSeconds, action: 'rest-exercise', exerciseName: ex.name, nextExName: nextExName, isLastTwoExercises: isLastTwoExercises });
        }
    });

    queue.push({ phase: '¡Rutina Finalizada!', duration: 5, action: 'finish' });
    currentQueueIndex = 0;
    loadNextPhase();
}

function loadNextPhase() {
    if (currentQueueIndex >= queue.length) return;
    const item = queue[currentQueueIndex];
    timeLeftInPhase = item.duration;
    updateTimerUI(item);

    if (item.action === 'prep' && timeLeftInPhase === 40) {
        speak("Comienza la preparación", 1.1);
    } else if (item.action === 'ecc' && item.isFirstPhaseOfRep && item.duration >= 1) {
        if (item.isUnilateral) speak(item.sideLabel + ", excen", 1.3);
        else speak("excen", 1.3);
        playSound('eccentric');
    } else if (item.action === 'ecc' && item.duration >= 1) {
        speak("excen", 1.3); playSound('eccentric');
    } else if (item.action === 'pause-bottom' && item.duration >= 1) {
        speak("pausa", 1.3); playSound('pause-bottom');
    } else if (item.action === 'con' && item.duration >= 1) {
        speak("concex", 1.3); playSound('concentric');
    } else if (item.action === 'pause-top' && item.duration >= 1) {
        speak("pausa", 1.3); playSound('pause-top');
    } else if (item.action === 'rest' || item.action === 'rest-exercise') {
        if (item.action === 'rest-exercise') {
            if (item.isLastTwoExercises) {
                const motivation = getRandomMotivationPhrase();
                speak(motivation + ". Siguiente: " + item.nextExName, 1.15);
            } else {
                speak(`Siguiente: ${item.nextExName}`, 1.2);
            }
            playSound('transition');
        } else {
            speak("Descanso", 1.2);
        }
    } else if (item.action === 'finish') {
        speak("Felicidades, has completado tu rutina", 1.1);
        saveHistory();
        clearRoutine();
        localStorage.removeItem('paused_routine'); // 🆕 Limpiar estado de pausa
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}

function updateTimerUI(item) {
    let title = item.phase;
    if (item.exerciseName) {
        title = `${item.exerciseName}`;
        if (item.isUnilateral && item.sideLabel) {
            title += ` - Serie ${item.setNumber}/${item.totalSets} - ${item.sideLabel} - Rep ${item.repNumber}/${item.totalReps}`;
        } else {
            title += ` - Serie ${item.setNumber}/${item.totalSets} | Rep ${item.repNumber}/${item.totalReps}`;
        }
    }
    document.getElementById('current-phase-title').innerText = title;
    document.getElementById('timer-seconds').innerText = timeLeftInPhase;
    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (timeLeftInPhase / item.duration) * circumference;
    circle.style.strokeDashoffset = offset;
}

function tick() {
    if (isPaused) return;
    const currentItem = queue[currentQueueIndex];
    const isTempoPhase = (currentItem.action === 'ecc' || currentItem.action === 'pause-bottom' || currentItem.action === 'con' || currentItem.action === 'pause-top');
    const isRestPhase = (currentItem.action === 'prep' || currentItem.action === 'rest' || currentItem.action === 'rest-trans' || currentItem.action === 'rest-exercise');

    if (isRestPhase) {
        if (timeLeftInPhase === 20) speak("20 segundos", 1.2);
        if (timeLeftInPhase === 8) speak("Asume tu posición", 1.2);
        if (timeLeftInPhase <= 5 && timeLeftInPhase > 0) playSound('metronome');
        if (timeLeftInPhase <= 3 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString(), 1.2);
    }

    if (isTempoPhase && currentItem.duration >= 3) {
        if (timeLeftInPhase < currentItem.duration && timeLeftInPhase > 0) playSound('metronome');
    }

    if (currentItem.action === 'rest-trans' && timeLeftInPhase === 7) {
        speak("Cambiar a " + currentItem.nextSide, 1.3);
    }

    timeLeftInPhase--;
    updateTimerUI(currentItem);

    if (timeLeftInPhase <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) loadNextPhase();
        else { clearInterval(timerInterval); finishRoutine(); }
    }
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPaused = !isPaused;
    document.getElementById('btn-start-pause').innerText = isPaused ? 'Reanudar' : 'Pausar';
    if (!isPaused) timerInterval = setInterval(tick, 1000);
    else clearInterval(timerInterval);
}

function finishRoutine() {
    clearInterval(timerInterval);
    speak("Rutina finalizada manualmente", 1.1);
    saveHistory();
    clearRoutine();
    localStorage.removeItem('paused_routine');
    showInterface('history-section');
}

// 🆕 NUEVO: PAUSAR Y SALIR (guarda estado para retomar en 14h)
function pauseAndExit() {
    if (currentQueueIndex === 0 && timeLeftInPhase === 40) {
        if (!confirm('Aún no has iniciado la rutina. ¿Deseas volver al programador?')) return;
        clearInterval(timerInterval);
        isPaused = true;
        showInterface('programmer-section');
        return;
    }

    if (!confirm('¿Pausar rutina? Podrás retomarla en las próximas 14 horas.')) return;

    const pauseState = {
        routine: JSON.parse(JSON.stringify(currentRoutine)),
        queue: JSON.parse(JSON.stringify(queue)),
        queueIndex: currentQueueIndex,
        timeLeft: timeLeftInPhase,
        timestamp: Date.now(),
        scheduledDay: currentScheduledDay,
        bodyPart: document.getElementById('body-part').value
    };

    localStorage.setItem('paused_routine', JSON.stringify(pauseState));
    clearInterval(timerInterval);
    isPaused = true;
    showInterface('programmer-section');
    alert('✅ Rutina pausada. Podrás retomarla en las próximas 14 horas desde el ejecutor.');
}

// 🆕 NUEVO: VERIFICAR SI HAY RUTINA PAUSADA AL ABRIR EJECUTOR
function checkPausedRoutine() {
    const paused = localStorage.getItem('paused_routine');
    if (!paused) return false;

    const state = JSON.parse(paused);
    const hoursPassed = (Date.now() - state.timestamp) / (1000 * 60 * 60);

    if (hoursPassed >= 14) {
        localStorage.removeItem('paused_routine');
        alert('⚠️ Han pasado más de 14 horas. La rutina pausada ha expirado.');
        return false;
    }

    const hoursLeft = Math.floor(14 - hoursPassed);
    const minsLeft = Math.floor((14 - hoursPassed - hoursLeft) * 60);

    if (confirm(`🔄 Tienes una rutina pausada hace ${Math.floor(hoursPassed * 60)} minutos.\n¿Deseas retomarla?\n(Tiempo restante: ${hoursLeft}h ${minsLeft}m)`)) {
        resumeRoutine(state);
        return true;
    } else {
        if (confirm('¿Deseas descartar la rutina pausada?')) {
            localStorage.removeItem('paused_routine');
        }
        return false;
    }
}

// 🆕 NUEVO: RETOMAR RUTINA PAUSADA
function resumeRoutine(state) {
    currentRoutine = state.routine;
    queue = state.queue;
    currentQueueIndex = state.queueIndex;
    timeLeftInPhase = state.timeLeft;
    currentScheduledDay = state.scheduledDay;

    showInterface('executor-section');
    updateTimerUI(queue[currentQueueIndex]);
    document.getElementById('btn-start-pause').innerText = 'Reanudar';
    isPaused = true;
    speak("Rutina retomada. Presiona reanudar para continuar.", 1.1);
}

function clearRoutine() {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    editIndex = -1;
    clearFormInputs();
    document.getElementById('total-time-display').innerText = '00:00';
    document.getElementById('exercise-list').innerHTML = '';
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    updateDayInfo(currentScheduledDay, false);
}

// ==========================================
// 5. HISTORIAL (MEJORADO)
// ==========================================
async function saveHistory() {
    const record = {
        user_id: currentUser ? currentUser.id : 'guest',
        date: new Date().toISOString().split('T')[0],
        body_part: document.getElementById('body-part').value,
        day: currentScheduledDay,
        exercises: currentRoutine.exercises,
        total_time: currentRoutine.totalTime,
        rest_between_exercises: currentRoutine.restBetweenExercises || 0
    };
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.push(record);
    localStorage.setItem('gym_history', JSON.stringify(history));
    if (navigator.onLine && currentUser) await supabaseClient.from('routines').insert(record);
}

async function loadHistory() {
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history = history.filter(h => new Date(h.date) >= sixWeeksAgo);
    localStorage.setItem('gym_history', JSON.stringify(history));

    if (navigator.onLine && currentUser) {
        const { data } = await supabaseClient.from('routines').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
        if (data) history = [...data, ...history].filter((v, i, a) => a.findIndex(t => (t.date === v.date && t.body_part === v.body_part && JSON.stringify(t.exercises) === JSON.stringify(v.exercises))) === i);
    }

    // Ordenar por fecha descendente
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    allHistoryData = history; // Guardar para filtros
    renderHistoryStats(history);
    applyHistoryFilters();
}

// 🆕 NUEVO: RENDERIZAR ESTADÍSTICAS
function renderHistoryStats(history) {
    const container = document.getElementById('history-stats');
    const totalRoutines = history.length;
    const totalTime = history.reduce((sum, r) => sum + (r.total_time || 0), 0);
    const streak = calculateStreak(history);
    const favoriteDay = getFavoriteDay(history);

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">🏋️</div>
                <div class="stat-value">${totalRoutines}</div>
                <div class="stat-label">Rutinas</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⏱️</div>
                <div class="stat-value">${formatTime(totalTime)}</div>
                <div class="stat-label">Tiempo total</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🔥</div>
                <div class="stat-value">${streak}</div>
                <div class="stat-label">Racha (días)</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⭐</div>
                <div class="stat-value">${favoriteDay || '-'}</div>
                <div class="stat-label">Día favorito</div>
            </div>
        </div>
    `;
}

// 🆕 NUEVO: CALCULAR RACHA DE DÍAS
function calculateStreak(history) {
    if (history.length === 0) return 0;
    const uniqueDates = [...new Set(history.map(h => h.date))].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < uniqueDates.length; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const checkDateStr = checkDate.toISOString().split('T')[0];

        if (uniqueDates.includes(checkDateStr)) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// 🆕 NUEVO: DÍA FAVORITO
function getFavoriteDay(history) {
    if (history.length === 0) return null;
    const dayCount = {};
    history.forEach(h => {
        dayCount[h.day] = (dayCount[h.day] || 0) + 1;
    });
    return Object.keys(dayCount).reduce((a, b) => dayCount[a] > dayCount[b] ? a : b);
}

// 🆕 NUEVO: APLICAR FILTROS
function applyHistoryFilters() {
    const search = document.getElementById('history-search').value.toLowerCase();
    const filterDay = document.getElementById('filter-day').value;
    const filterType = document.getElementById('filter-type').value;

    let filtered = allHistoryData.filter(item => {
        const matchSearch = !search || item.exercises.some(e => e.name.toLowerCase().includes(search));
        const matchDay = !filterDay || item.day === filterDay;
        const matchType = !filterType || item.body_part === filterType;
        return matchSearch && matchDay && matchType;
    });

    renderHistoryList(filtered);
}

// 🆕 NUEVO: RENDERIZAR LISTA MEJORADA
function renderHistoryList(history) {
    const container = document.getElementById('history-list');

    if (history.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No hay registros que coincidan con los filtros.</p>';
        return;
    }

    container.innerHTML = history.map((item, index) => {
        const typeIcon = item.body_part === 'Tren Superior' ? '💪' : item.body_part === 'Tren Inferior' ? '🦵' : '🏃';
        const exercisesList = item.exercises.map(e => e.name).join(', ');
        const unilateralCount = item.exercises.filter(e => e.equipment !== 'Sin equipo' && e.quantity === 1).length;

        return `
            <div class="history-item">
                <button class="delete-btn" onclick="deleteHistory(${allHistoryData.indexOf(item)})">×</button>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <span style="font-size: 28px;">${typeIcon}</span>
                    <div style="flex: 1;">
                        <h3 style="margin: 0; color: #0C047D; font-size: 16px;">${item.date}</h3>
                        <p style="margin: 2px 0 0 0; font-size: 12px; color: #666;">${item.day} • ${item.body_part}</p>
                    </div>
                </div>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                    <p style="margin: 0; font-size: 13px;"><strong>⏱️ ${formatTime(item.total_time)}</strong> • ${item.exercises.length} ejercicios${unilateralCount > 0 ? ` (${unilateralCount} unilateral${unilateralCount > 1 ? 'es' : ''})` : ''}</p>
                    <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;"><small>${exercisesList}</small></p>
                </div>
                <button onclick='reuseRoutine(${allHistoryData.indexOf(item)})' style="width: 100%; padding: 8px; background: #0C047D; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">🔄 Reutilizar esta rutina</button>
            </div>
        `;
    }).join('');
}

// 🆕 NUEVO: REUTILIZAR RUTINA DEL HISTORIAL
function reuseRoutine(index) {
    const item = allHistoryData[index];
    if (!item) return;

    if (currentRoutine.exercises.length > 0) {
        if (!confirm('Tienes una rutina en edición. ¿Reemplazarla con esta?')) return;
    }

    currentRoutine = {
        exercises: JSON.parse(JSON.stringify(item.exercises)),
        totalTime: item.total_time,
        restBetweenExercises: item.rest_between_exercises || 0
    };
    currentScheduledDay = item.day;
    document.getElementById('routine-day').value = item.day;
    document.getElementById('body-part').value = item.body_part;
    document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises || 0) / 60);

    renderExerciseList();
    document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
    updateDayInfo(item.day, true);
    showInterface('programmer-section');
    alert('✅ Rutina cargada en el programador. Puedes modificarla o iniciarla.');
}

function deleteHistory(index) {
    if (!confirm('¿Eliminar este registro del historial?')) return;
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.splice(index, 1);
    localStorage.setItem('gym_history', JSON.stringify(history));
    loadHistory();
}

// ==========================================
// 6. UTILIDADES
// ==========================================
function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');

    // 🆕 Verificar rutina pausada al abrir ejecutor
    if (id === 'executor-section') {
        setTimeout(() => checkPausedRoutine(), 300);
    }
}

function syncToSupabase() {
    if (navigator.onLine && currentUser) { /* Sync logic */ }
}

window.addEventListener('online', syncToSupabase);
