// ==========================================
// CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = 'https://doyzequfqtdjtnldewhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXplcXVmcXRkanRubGRld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA4NTksImV4cCI6MjA5NzA1Njg1OX0.hBE_AwyEfKX1pF0rk2No3loAVAVJ6U6AjusAvjQTQmI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ESTADO GLOBAL & WAKE LOCK
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
let allHistoryData = [];
let wakeLock = null;

async function requestWakeLock() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (err) {}
}
function releaseWakeLock() { if (wakeLock) { wakeLock.release().then(() => { wakeLock = null; }); } }
document.addEventListener('visibilitychange', async () => { if (wakeLock && document.visibilityState === 'visible') await requestWakeLock(); });

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const equipSelect = document.getElementById('ex-equipment');
    if (equipSelect) { equipSelect.addEventListener('change', toggleQuantity); toggleQuantity(); }
    const daySelect = document.getElementById('routine-day');
    if (daySelect) { daySelect.addEventListener('change', handleDayChange); setDefaultDay(); }
});

function toggleQuantity() {
    const equip = document.getElementById('ex-equipment');
    const qty = document.getElementById('ex-quantity');
    if (!equip || !qty) return;
    if (equip.value === 'Sin equipo') { qty.disabled = true; qty.value = '2'; }
    else { qty.disabled = false; }
}

function setDefaultDay() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = days[new Date().getDay()];
    const daySelect = document.getElementById('routine-day');
    if (daySelect) { daySelect.value = today; currentScheduledDay = today; loadRoutineForDay(today); }
}

function handleDayChange() {
    const selectedDay = document.getElementById('routine-day').value;
    if (currentRoutine.exercises.length > 0) {
        if (!confirm(`Tienes una rutina en edición. ¿Cargar la del ${selectedDay}?`)) {
            document.getElementById('routine-day').value = currentScheduledDay; return;
        }
    }
    currentScheduledDay = selectedDay; loadRoutineForDay(selectedDay);
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
        clearFormInputs(); updateDayInfo(day, false);
    }
}

function updateDayInfo(day, hasRoutine) {
    const info = document.getElementById('routine-day-info');
    if (!info) return;
    if (hasRoutine) { info.innerHTML = `✅ Rutina para <strong>${day}</strong> (${currentRoutine.exercises.length} ej).`; info.style.color = '#28a745'; }
    else { info.innerHTML = `ℹ️ No hay rutina para <strong>${day}</strong>.`; info.style.color = '#666'; }
}

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(error.message, 'auth-message');
    currentUser = data.user; initApp();
}

async function register() {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    if (!name) return showMessage('⚠️ Ingresa tu nombre.', 'register-message');
    if (!email || !password) return showMessage('⚠️ Completa todos los campos.', 'register-message');
    if (password.length < 6) return showMessage('⚠️ Contraseña mín 6 caracteres.', 'register-message');
    if (password !== passwordConfirm) return showMessage('⚠️ Contraseñas no coinciden.', 'register-message');
    showMessage('Creando cuenta...', 'register-message');
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) return showMessage('Error: ' + error.message, 'register-message');
    showMessage('✅ ¡Cuenta creada! Redirigiendo...', 'register-message');
    currentUser = data.user; setTimeout(() => initApp(), 1500);
}

async function resetPassword() {
    const email = document.getElementById('login-email').value;
    if (!email) return showMessage('⚠️ Escribe tu correo.', 'auth-message');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) showMessage('Error: ' + error.message, 'auth-message');
    else showMessage('✅ Enlace enviado a tu correo.', 'auth-message');
}

function showMessage(msg, elementId = 'auth-message') {
    const el = document.getElementById(elementId); if (el) el.innerText = msg;
}

async function initApp() {
    showInterface('programmer-section');
    const userName = currentUser.user_metadata?.full_name || (currentUser.email ? currentUser.email.split('@')[0] : 'Atleta');
    speakRandomGreeting(userName);
    await loadPlanFromCloud();
}

// ==========================================
// SINCRONIZACIÓN SUPABASE
// ==========================================
async function syncPlanToCloud() {
    if (!currentUser || !navigator.onLine) return;
    const plan12 = localStorage.getItem('12_week_plan') || '{}';
    const scheduled = localStorage.getItem('scheduled_routines') || '{}';
    await supabaseClient.from('user_plans').upsert({
        user_id: currentUser.id,
        plan_12_weeks: JSON.parse(plan12),
        scheduled_routines: JSON.parse(scheduled),
        updated_at: new Date().toISOString()
    });
}

async function loadPlanFromCloud() {
    if (!currentUser || !navigator.onLine) return;
    const { data, error } = await supabaseClient.from('user_plans').select('*').eq('user_id', currentUser.id).single();
    if (data && !error) {
        const localScheduled = localStorage.getItem('scheduled_routines');
        if (!localScheduled || localScheduled === '{}') {
            localStorage.setItem('12_week_plan', JSON.stringify(data.plan_12_weeks || {}));
            localStorage.setItem('scheduled_routines', JSON.stringify(data.scheduled_routines || {}));
            loadRoutineForDay(currentScheduledDay);
        }
    }
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

function speakRandomGreeting(name) { speak(phrases[Math.floor(Math.random() * phrases.length)].replace('{name}', name), 1.1); }
function getRandomMotivationPhrase() { return motivationPhrases[Math.floor(Math.random() * motivationPhrases.length)]; }
function speak(text, rate = 1.1) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text); u.lang = 'es-ES'; u.rate = rate;
        window.speechSynthesis.speak(u);
    }
}

// ==========================================
// PRESETS DE TEMPO
// ==========================================
function applyTempoPreset(ecc, pb, con, pt) {
    document.getElementById('tempo-ecc').value = ecc;
    document.getElementById('tempo-pb').value = pb;
    document.getElementById('tempo-con').value = con;
    document.getElementById('tempo-pt').value = pt;
}

// ==========================================
// 3. PROGRAMADOR
// ==========================================
function addExercise() {
    const nameEl = document.getElementById('ex-name');
    const qtyEl = document.getElementById('ex-quantity');
    if (!nameEl || !qtyEl) return alert("⚠️ Error de carga. Recarga la página (Ctrl + F5).");

    let conInput = document.getElementById('tempo-con').value.trim().toUpperCase();
    let isExplosive = (conInput === 'X');
    let conVal = isExplosive ? 1 : (parseInt(conInput) || 0);

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
            con: conVal,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0,
            isExplosive: isExplosive
        },
        rest: { set: parseInt(document.getElementById('rest-set').value) || 0 }
    };
    if (!ex.name) return alert('Ingresa un nombre de ejercicio');
    if (editIndex >= 0) {
        currentRoutine.exercises[editIndex] = ex; editIndex = -1;
        document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    } else { currentRoutine.exercises.push(ex); }
    calculateTotalTime(); renderExerciseList(); clearExerciseInputs();
}

function clearExerciseInputs() {
    ['ex-name','ex-sets','ex-reps','ex-weight','tempo-ecc','tempo-pb','tempo-con','tempo-pt','rest-set'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('ex-equipment').value = 'Sin equipo';
    document.getElementById('ex-quantity').value = '2'; toggleQuantity();
}
function clearFormInputs() { clearExerciseInputs(); document.getElementById('rest-ex-global').value = ''; }

function editExercise(index) {
    const ex = currentRoutine.exercises[index]; editIndex = index;
    document.getElementById('ex-name').value = ex.name;
    document.getElementById('ex-sets').value = ex.sets;
    document.getElementById('ex-reps').value = ex.reps;
    document.getElementById('ex-weight').value = ex.weight;
    document.getElementById('ex-equipment').value = ex.equipment;
    document.getElementById('ex-quantity').value = ex.quantity;
    document.getElementById('tempo-ecc').value = ex.tempo.ecc;
    document.getElementById('tempo-pb').value = ex.tempo.pb;
    document.getElementById('tempo-con').value = ex.tempo.isExplosive ? 'X' : ex.tempo.con;
    document.getElementById('tempo-pt').value = ex.tempo.pt;
    document.getElementById('rest-set').value = ex.rest.set;
    toggleQuantity();
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Guardar Cambios';
    window.scrollTo(0, 0);
}

function deleteExercise(index) {
    currentRoutine.exercises.splice(index, 1); editIndex = -1;
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    calculateTotalTime(); renderExerciseList();
}

function calculateTotalTime() {
    let totalSeconds = 40;
    const restExSeconds = (parseInt(document.getElementById('rest-ex-global').value) || 0) * 60;
    currentRoutine.exercises.forEach((ex, idx) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
        for (let s = 1; s <= ex.sets; s++) {
            if (isUnilateral) { totalSeconds += (repCycle * ex.reps) * 2 + 8; }
            else { totalSeconds += (repCycle * ex.reps); }
            if (s < ex.sets) totalSeconds += ex.rest.set;
        }
        if (idx < currentRoutine.exercises.length - 1) totalSeconds += restExSeconds;
    });
    currentRoutine.totalTime = totalSeconds;
    currentRoutine.restBetweenExercises = restExSeconds;
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderExerciseList() {
    const list = document.getElementById('exercise-list');
    list.innerHTML = currentRoutine.exercises.map((ex, i) => {
        const isUni = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const note = isUni ? `(${ex.reps} Izq → 8s → ${ex.reps} Der) x${ex.sets}` : '';
        const conDisplay = ex.tempo.isExplosive ? 'X' : ex.tempo.con;
        return `<li style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #ddd;">
            <div><strong>${i+1}. ${ex.name}</strong> ${note}<br>
            <small>${ex.sets}x${ex.reps} | ${ex.weight||'Sin peso'} | Tempo: ${ex.tempo.ecc}-${ex.tempo.pb}-${conDisplay}-${ex.tempo.pt}</small></div>
            <div>
                <button onclick="editExercise(${i})" style="width:auto;padding:5px 10px;font-size:12px;margin:0 5px;background:#ffc107;color:#000;border:none;border-radius:5px;cursor:pointer;">✏️</button>
                <button onclick="deleteExercise(${i})" style="width:auto;padding:5px 10px;font-size:12px;margin:0;background:#ff4444;color:#fff;border:none;border-radius:5px;cursor:pointer;">🗑️</button>
            </div></li>`;
    }).join('');
}

function saveRoutineToStorage() {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    currentRoutine.restBetweenExercises = (parseInt(document.getElementById('rest-ex-global').value) || 0) * 60;
    allRoutines[currentScheduledDay] = { ...JSON.parse(JSON.stringify(currentRoutine)), bodyPart: document.getElementById('body-part').value, savedAt: new Date().toISOString() };
    localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
    syncPlanToCloud();
}

function saveRoutineOnly() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    saveRoutineToStorage(); updateDayInfo(currentScheduledDay, true);
    alert(`✅ Rutina guardada para el ${currentScheduledDay}.`);
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    saveRoutineToStorage();
    localStorage.setItem('pending_routine', JSON.stringify(currentRoutine));
    buildTimerQueue(); showInterface('executor-section');
    requestWakeLock();
    speak("Dispondrás de 40 segundos para prepararte", 1.1);
}

function showScheduledRoutines() { showInterface('scheduled-routines-section'); renderScheduledRoutines(); }

function renderScheduledRoutines() {
    const container = document.getElementById('scheduled-routines-list');
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let html = '';
    days.forEach(day => {
        const routine = allRoutines[day];
        const isToday = day === getCurrentDayName();
        const badge = isToday ? ' <span style="background:#C23D55;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">HOY</span>' : '';
        if (routine) {
            const exList = routine.exercises.map(e => e.name).join(', ');
            html += `<div style="background:${isToday?'#e8f5e9':'#f8f9fa'};padding:15px;border-radius:10px;margin-bottom:10px;border-left:4px solid ${isToday?'#28a745':'#0C047D'};">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:5px;">
                    <h3 style="margin:0;color:#0C047D;">${day}${badge}</h3>
                    <div style="display:flex;gap:5px;">
                        <button onclick="loadAndStartRoutine('${day}')" style="padding:5px 10px;font-size:12px;background:#28a745;color:white;border:none;border-radius:5px;cursor:pointer;">▶</button>
                        <button onclick="editScheduledRoutine('${day}')" style="padding:5px 10px;font-size:12px;background:#ffc107;color:#000;border:none;border-radius:5px;cursor:pointer;">✏️</button>
                        <button onclick="deleteScheduledRoutine('${day}')" style="padding:5px 10px;font-size:12px;background:#ff4444;color:white;border:none;border-radius:5px;cursor:pointer;">🗑️</button>
                    </div>
                </div>
                <p style="margin:5px 0;font-size:13px;"><strong>${routine.bodyPart||'Full Body'}</strong> | ⏱️ ${formatTime(routine.totalTime)}</p>
                <p style="margin:5px 0;font-size:12px;color:#888;"><small>${exList}</small></p>
            </div>`;
        } else {
            html += `<div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px;border-left:4px solid #ccc;opacity:0.7;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;color:#999;">${day}${badge}</h3>
                    <button onclick="createRoutineForDay('${day}')" style="padding:5px 12px;font-size:12px;background:#0C047D;color:white;border:none;border-radius:5px;cursor:pointer;">+ Crear</button>
                </div>
                <p style="margin:5px 0;font-size:12px;color:#999;">Sin rutina programada</p>
            </div>`;
        }
    });
    container.innerHTML = html;
}

function getCurrentDayName() { return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()]; }

function loadAndStartRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    if (!allRoutines[day]) return alert('No hay rutina');
    currentRoutine = JSON.parse(JSON.stringify(allRoutines[day]));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = allRoutines[day].bodyPart || 'Full Body';
    saveAndStartRoutine();
}

function editScheduledRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    if (!allRoutines[day]) return;
    currentRoutine = JSON.parse(JSON.stringify(allRoutines[day]));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = allRoutines[day].bodyPart || 'Full Body';
    document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises || 0) / 60);
    renderExerciseList();
    document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
    updateDayInfo(day, true); showInterface('programmer-section');
}

function createRoutineForDay(day) {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    currentScheduledDay = day; document.getElementById('routine-day').value = day;
    clearFormInputs(); updateDayInfo(day, false); showInterface('programmer-section');
}

function deleteScheduledRoutine(day) {
    if (!confirm(`¿Eliminar la rutina del ${day}?`)) return;
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    delete allRoutines[day]; localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
    if (day === currentScheduledDay) {
        currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
        clearFormInputs(); document.getElementById('total-time-display').innerText = '00:00';
        document.getElementById('exercise-list').innerHTML = ''; updateDayInfo(day, false);
    }
    renderScheduledRoutines();
}

// ==========================================
// IMPORTACIÓN CSV Y PLAN 12 SEMANAS
// ==========================================
function downloadCSVTemplate() {
    const csv = "Semana,Dia,Ejercicio,Series,Reps,Peso,Equipo,Cantidad,Tempo_Ecc,Tempo_PB,Tempo_Con,Tempo_PT,Descanso_Serie,Grupo,Descanso_Global\n1,Lunes,Press Banca,4,8,60kg,Mancuernas,2,3,1,1,1,90,Tren Superior,2\n1,Lunes,Remo,4,8,50kg,Mancuernas,2,3,1,1,1,90,Tren Superior,2";
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "plantilla_gym_12semanas.csv");
    link.click();
}

function handleCSVImport(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const rows = e.target.result.split(/\r?\n/).filter(r => r.trim() !== '');
            const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
            const planData = {};
            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].split(',').map(c => c.trim()); if (cols.length < 5) continue;
                const rowObj = {}; headers.forEach((h, idx) => rowObj[h] = cols[idx] || '');
                const semana = rowObj.semana || '1'; const dia = rowObj.dia || 'Lunes';
                if (!planData[semana]) planData[semana] = {};
                if (!planData[semana][dia]) planData[semana][dia] = { exercises: [], bodyPart: rowObj.grupo || 'Full Body', restGlobal: parseInt(rowObj.descanso_global) || 0 };
                let conVal = rowObj.tempo_con ? rowObj.tempo_con.trim().toUpperCase() : '0';
                let isExp = (conVal === 'X');
                planData[semana][dia].exercises.push({
                    name: rowObj.ejercicio, sets: parseInt(rowObj.series)||1, reps: parseInt(rowObj.reps)||1, weight: rowObj.peso||'',
                    equipment: rowObj.equipo||'Sin equipo', quantity: parseInt(rowObj.cantidad)||2,
                    tempo: { ecc: parseInt(rowObj.tempo_ecc)||0, pb: parseInt(rowObj.tempo_pb)||0, con: isExp?1:(parseInt(conVal)||0), pt: parseInt(rowObj.tempo_pt)||0, isExplosive: isExp },
                    rest: { set: parseInt(rowObj.descanso_serie)||0 }
                });
            }
            localStorage.setItem('12_week_plan', JSON.stringify(planData));
            if (planData['1']) {
                const currentRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
                Object.keys(planData['1']).forEach(day => {
                    const r = planData['1'][day]; let totalSec = 40;
                    r.exercises.forEach((ex, idx) => {
                        const isUni = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
                        const cycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
                        for (let s=1; s<=ex.sets; s++) {
                            totalSec += isUni ? (cycle*ex.reps)*2+8 : (cycle*ex.reps);
                            if (s < ex.sets) totalSec += ex.rest.set;
                        }
                        if (idx < r.exercises.length-1) totalSec += r.restGlobal*60;
                    });
                    currentRoutines[day] = { ...r, totalTime: totalSec, restBetweenExercises: r.restGlobal*60 };
                });
                localStorage.setItem('scheduled_routines', JSON.stringify(currentRoutines));
            }
            await syncPlanToCloud();
            alert('✅ Plan importado y sincronizado. La Semana 1 ya está activa.');
            showScheduledRoutines();
        } catch (err) { alert('❌ Error al leer el CSV. Usa la plantilla descargada.'); console.error(err); }
    };
    reader.readAsText(file);
}

function show12WeekPlan() {
    showInterface('twelve-week-section');
    const planData = JSON.parse(localStorage.getItem('12_week_plan') || '{}');
    const container = document.getElementById('twelve-week-content');
    if (Object.keys(planData).length === 0) { container.innerHTML = '<p style="text-align:center;color:#999;">No hay plan importado.</p>'; return; }
    const startDate = new Date(); startDate.setHours(0,0,0,0);
    const daysMap = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5,'Sábado':6,'Domingo':0 };
    let html = '';
    Object.keys(planData).sort((a,b) => parseInt(a)-parseInt(b)).forEach(weekNum => {
        const weekOffset = parseInt(weekNum) - 1;
        html += `<div style="margin-bottom:20px;border:1px solid #ddd;border-radius:10px;overflow:hidden;">
            <div style="background:#0C047D;color:white;padding:10px;font-weight:bold;">Semana ${weekNum}</div><div style="padding:10px;">`;
        Object.keys(planData[weekNum]).forEach(dayName => {
            const routine = planData[weekNum][dayName];
            const dayIndex = daysMap[dayName]; let daysToAdd = (dayIndex - startDate.getDay() + 7) % 7;
            if (weekOffset > 0 || daysToAdd === 0) daysToAdd += (weekOffset * 7);
            const exactDate = new Date(startDate); exactDate.setDate(startDate.getDate() + daysToAdd);
            const dateStr = exactDate.toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
            const exNames = routine.exercises.map(e => e.name).join(', ');
            html += `<div style="background:#f8f9fa;padding:10px;border-radius:8px;margin-bottom:8px;border-left:4px solid #C23D55;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${dayName}</strong><span style="font-size:12px;color:#666;">📅 ${dateStr}</span>
                </div>
                <p style="font-size:12px;color:#555;margin:5px 0 0 0;">${routine.bodyPart} | ${routine.exercises.length} ej: <small>${exNames}</small></p>
            </div>`;
        });
        html += `</div></div>`;
    });
    container.innerHTML = html;
}

function delete12WeekPlan() {
    if (!confirm('⚠️ ¿Eliminar TODO el plan de 12 semanas y las rutinas programadas?')) return;
    localStorage.removeItem('12_week_plan');
    localStorage.removeItem('scheduled_routines');
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    clearFormInputs();
    document.getElementById('total-time-display').innerText = '00:00';
    document.getElementById('exercise-list').innerHTML = '';
    syncPlanToCloud();
    alert('✅ Plan eliminado.');
    showScheduledRoutines();
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
        osc.frequency.exponentialRampToValueAtTime(100, now+0.05);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.05);
        osc.start(now); osc.stop(now+0.05);
    } else if (type === 'eccentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(150, now+0.5);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.8);
        osc.start(now); osc.stop(now+0.8);
    } else if (type === 'concentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now+0.3);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.8);
        osc.start(now); osc.stop(now+0.8);
    } else if (type === 'con-explosive') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(300, now+0.15);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.15);
        osc.start(now); osc.stop(now+0.15);
    } else if (type === 'pause-bottom') { playDoubleBeep(now);
    } else if (type === 'pause-top') { playTripleBeep(now);
    } else if (type === 'transition') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now+0.3);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.3);
        osc.start(now); osc.stop(now+0.3);
    }
}

function playDoubleBeep(time) {
    const o1 = audioCtx.createOscillator(); const g1 = audioCtx.createGain();
    const o2 = audioCtx.createOscillator(); const g2 = audioCtx.createGain();
    o1.connect(g1); o2.connect(g2); g1.connect(audioCtx.destination); g2.connect(audioCtx.destination);
    o1.type='sine'; o1.frequency.setValueAtTime(600,time); g1.gain.setValueAtTime(0.3,time); g1.gain.exponentialRampToValueAtTime(0.01,time+0.1);
    o1.start(time); o1.stop(time+0.1);
    o2.type='sine'; o2.frequency.setValueAtTime(600,time+0.2); g2.gain.setValueAtTime(0.3,time+0.2); g2.gain.exponentialRampToValueAtTime(0.01,time+0.3);
    o2.start(time+0.2); o2.stop(time+0.3);
}

function playTripleBeep(time) {
    for (let i=0; i<3; i++) {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type='sine'; osc.frequency.setValueAtTime(1200, time+(i*0.15));
        gain.gain.setValueAtTime(0.2, time+(i*0.15)); gain.gain.exponentialRampToValueAtTime(0.01, time+(i*0.15)+0.08);
        osc.start(time+(i*0.15)); osc.stop(time+(i*0.15)+0.08);
    }
}

function buildTimerQueue() {
    queue = [{ phase: 'Preparación', duration: 40, action: 'prep' }];
    const totalExercises = currentRoutine.exercises.length;
    const restExSeconds = currentRoutine.restBetweenExercises || 0;

    currentRoutine.exercises.forEach((ex, exIndex) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const nextExName = currentRoutine.exercises[exIndex+1] ? currentRoutine.exercises[exIndex+1].name : "el final";
        const isLastTwo = (exIndex >= totalExercises - 2);
        const tEcc = parseInt(ex.tempo.ecc)||0;
        const tPb = parseInt(ex.tempo.pb)||0;
        const tCon = parseInt(ex.tempo.con)||0;
        const tPt = parseInt(ex.tempo.pt)||0;
        const isExp = ex.tempo.isExplosive;

        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                const phases = [];
                if (tEcc > 0) phases.push({ phase:'Excéntrico', duration:tEcc, action:'ecc' });
                if (tPb > 0) phases.push({ phase:'Pausa Abajo', duration:tPb, action:'pause-bottom' });
                if (tCon > 0) {
                    if (isExp) phases.push({ phase:'¡EXPLOSIVO!', duration:1, action:'con-explosive' });
                    else phases.push({ phase:'Concéntrico', duration:tCon, action:'con' });
                }
                if (tPt > 0) phases.push({ phase:'Pausa Arriba', duration:tPt, action:'pause-top' });
                phases.forEach((p, idx) => {
                    queue.push({ ...p, exerciseName:ex.name, setNumber:s, repNumber:r, totalReps:ex.reps, totalSets:ex.sets, sideLabel:isUnilateral?"Izquierda":"", blockSide:isUnilateral?"left":null, isFirstPhaseOfRep:(idx===0), isUnilateral });
                });
            }
            if (isUnilateral) {
                queue.push({ phase:'Transición', duration:8, action:'rest-trans', exerciseName:ex.name, setNumber:s, totalSets:ex.sets, nextSide:"Derecha", isUnilateral:true });
                for (let r = 1; r <= ex.reps; r++) {
                    const phases = [];
                    if (tEcc > 0) phases.push({ phase:'Excéntrico', duration:tEcc, action:'ecc' });
                    if (tPb > 0) phases.push({ phase:'Pausa Abajo', duration:tPb, action:'pause-bottom' });
                    if (tCon > 0) {
                        if (isExp) phases.push({ phase:'¡EXPLOSIVO!', duration:1, action:'con-explosive' });
                        else phases.push({ phase:'Concéntrico', duration:tCon, action:'con' });
                    }
                    if (tPt > 0) phases.push({ phase:'Pausa Arriba', duration:tPt, action:'pause-top' });
                    phases.forEach((p, idx) => {
                        queue.push({ ...p, exerciseName:ex.name, setNumber:s, repNumber:r, totalReps:ex.reps, totalSets:ex.sets, sideLabel:"Derecha", blockSide:"right", isFirstPhaseOfRep:(idx===0), isUnilateral:true });
                    });
                }
            }
            if (s < ex.sets) queue.push({ phase:'Descanso entre series', duration:ex.rest.set, action:'rest', exerciseName:ex.name, setNumber:s, totalSets:ex.sets });
        }
        if (exIndex < totalExercises-1 && restExSeconds > 0) {
            queue.push({ phase:'Descanso entre ejercicios', duration:restExSeconds, action:'rest-exercise', exerciseName:ex.name, nextExName, isLastTwoExercises:isLastTwo });
        }
    });
    queue.push({ phase:'¡Rutina Finalizada!', duration:5, action:'finish' });
    currentQueueIndex = 0; loadNextPhase();
}

function loadNextPhase() {
    if (currentQueueIndex >= queue.length) return;
    const item = queue[currentQueueIndex];
    
    // Blindaje: Si la duración es 0, saltar sin emitir audio
    if (item.duration <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) loadNextPhase();
        else { clearInterval(timerInterval); finishRoutine(); }
        return;
    }
    
    timeLeftInPhase = item.duration;
    updateTimerUI(item);
    
    // 🆕 LÓGICA ASIMÉTRICA: Fases de movimiento vs Fases de pausa
    const isShort = item.duration <= 1; // Detectar si es un tempo ultra-rápido

    if (item.action === 'prep' && timeLeftInPhase === 40) {
        speak("Comienza la preparación", 1.1);
    } 
    // 🏋️ EXCÉNTRICO (Movimiento: Voz + Sonido)
    else if (item.action === 'ecc' && item.duration >= 1) {
        playSound('eccentric');
        if (isShort) speak("Baja", 1.5); // Palabra corta para 1s
        else if (item.isUnilateral && item.isFirstPhaseOfRep) speak(item.sideLabel + ", excéntrico, inhala", 1.2);
        else speak("Excéntrico, inhala", 1.2);
    } 
    // 🧘 PAUSA ABAJO (Isometría: SOLO BEEP, Cero Voz)
    else if (item.action === 'pause-bottom' && item.duration >= 1) {
        playSound('pause-bottom'); // Doble beep
        // ⚠️ No se llama a speak() para mantener el foco y no cortar la siguiente fase
    } 
    // 🏋️ CONCÉNTRICO (Movimiento: Voz + Sonido)
    else if (item.action === 'con' && item.duration >= 1) {
        playSound('concentric');
        if (isShort) speak("Empuja", 1.5); // Palabra corta para 1s
        else speak("Concéntrico, exhala", 1.2);
    } 
    // ⚡ CONCÉNTRICO EXPLOSIVO (Movimiento: Voz + Sonido)
    else if (item.action === 'con-explosive' && item.duration >= 1) {
        playSound('con-explosive');
        speak("¡Empuja!", 1.5);
    } 
    // 🧘 PAUSA ARRIBA (Isometría: SOLO BEEP, Cero Voz)
    else if (item.action === 'pause-top' && item.duration >= 1) {
        playSound('pause-top'); // Triple beep
        // ⚠️ No se llama a speak()
    } 
    // 🔄 DESCANSO ENTRE EJERCICIOS
    else if (item.action === 'rest-exercise') {
        playSound('transition');
        if (item.isLastTwoExercises) {
            speak(getRandomMotivationPhrase() + ". Siguiente: " + item.nextExName, 1.15);
        } else {
            speak(`Siguiente: ${item.nextExName}`, 1.2);
        }
    } 
    // 🛑 DESCANSO ENTRE SERIES
    else if (item.action === 'rest') {
        speak("Descanso", 1.2);
    } 
    // 🏁 FINALIZADO
    else if (item.action === 'finish') {
        speak("Felicidades, has completado tu rutina", 1.1);
        saveHistory();
        clearRoutine();
        localStorage.removeItem('paused_routine');
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}
    // PAUSA ABAJO
    else if (item.action === 'pause-bottom' && item.duration >= 1) {
        playSound('pause-bottom'); // Sonido SIEMPRE
        if (shouldSpeak) speak("Pausa abajo, aguanta", 1.2);
    } 
    // CONCÉNTRICO NORMAL
    else if (item.action === 'con' && item.duration >= 1) {
        playSound('concentric'); // Sonido SIEMPRE
        if (shouldSpeak) speak("Concéntrico, exhala", 1.2);
    } 
    // CONCÉNTRICO EXPLOSIVO ("X")
    else if (item.action === 'con-explosive' && item.duration >= 1) {
        playSound('con-explosive'); // Sonido SIEMPRE (látigo)
        if (shouldSpeak) speak("¡Empuja y exhala!", 1.3);
    } 
    // PAUSA ARRIBA
    else if (item.action === 'pause-top' && item.duration >= 1) {
        playSound('pause-top'); // Sonido SIEMPRE
        if (shouldSpeak) speak("Pausa arriba, respira", 1.2);
    } 
    // DESCANSO ENTRE EJERCICIOS
    else if (item.action === 'rest-exercise') {
        playSound('transition');
        if (item.isLastTwoExercises) {
            const motivation = getRandomMotivationPhrase();
            speak(motivation + ". Siguiente: " + item.nextExName, 1.15);
        } else {
            speak(`Siguiente: ${item.nextExName}`, 1.2);
        }
    } 
    // DESCANSO ENTRE SERIES
    else if (item.action === 'rest') {
        speak("Descanso", 1.2);
    } 
    // FINALIZADO
    else if (item.action === 'finish') {
        speak("Felicidades, has completado tu rutina", 1.1);
        saveHistory();
        clearRoutine();
        localStorage.removeItem('paused_routine');
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}

function updateTimerUI(item) {
    let title = item.phase;
    if (item.exerciseName) {
        title = item.exerciseName;
        if (item.isUnilateral && item.sideLabel) title += ` - S${item.setNumber}/${item.totalSets} - ${item.sideLabel} - R${item.repNumber}/${item.totalReps}`;
        else if (item.setNumber) title += ` - S${item.setNumber}/${item.totalSets} | R${item.repNumber}/${item.totalReps}`;
    }
    document.getElementById('current-phase-title').innerText = title;
    document.getElementById('timer-seconds').innerText = timeLeftInPhase;
    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value; const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (timeLeftInPhase / item.duration) * circumference;

    let color = '#ffffff';
    if (item.action === 'ecc') color = '#ff4444';
    else if (item.action === 'pause-bottom') color = '#ffc107';
    else if (item.action === 'con' || item.action === 'con-explosive') color = '#28a745';
    else if (item.action === 'pause-top') color = '#007bff';
    else if (item.action === 'rest' || item.action === 'prep' || item.action === 'rest-trans' || item.action === 'rest-exercise') color = '#aaaaaa';
    circle.style.stroke = color;
}

function tick() {
    if (isPaused) return;
    const currentItem = queue[currentQueueIndex];
    const isTempo = (currentItem.action === 'ecc' || currentItem.action === 'pause-bottom' || currentItem.action === 'con' || currentItem.action === 'con-explosive' || currentItem.action === 'pause-top');
    const isRest = (currentItem.action === 'prep' || currentItem.action === 'rest' || currentItem.action === 'rest-trans' || currentItem.action === 'rest-exercise');
    if (isRest) {
        if (timeLeftInPhase === 20) speak("20 segundos", 1.2);
        if (timeLeftInPhase === 8) speak("Asume tu posición", 1.2);
        if (timeLeftInPhase <= 5 && timeLeftInPhase > 0) playSound('metronome');
        if (timeLeftInPhase <= 3 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString(), 1.2);
    }
    if (isTempo && currentItem.duration >= 3 && timeLeftInPhase < currentItem.duration && timeLeftInPhase > 0) playSound('metronome');
    if (currentItem.action === 'rest-trans' && timeLeftInPhase === 7) speak("Cambiar a "+currentItem.nextSide, 1.3);
    timeLeftInPhase--; updateTimerUI(currentItem);
    if (timeLeftInPhase <= 0) { currentQueueIndex++; if (currentQueueIndex < queue.length) loadNextPhase(); else { clearInterval(timerInterval); finishRoutine(); } }
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPaused = !isPaused;
    document.getElementById('btn-start-pause').innerText = isPaused ? 'Reanudar' : 'Pausar';
    if (!isPaused) { timerInterval = setInterval(tick, 1000); requestWakeLock(); }
    else clearInterval(timerInterval);
}

function finishRoutine() {
    clearInterval(timerInterval); speak("Rutina finalizada manualmente", 1.1);
    saveHistory(); clearRoutine(); releaseWakeLock();
    localStorage.removeItem('paused_routine'); showInterface('history-section');
}

function pauseAndExit() {
    if (currentQueueIndex === 0 && timeLeftInPhase === 40) {
        if (!confirm('Aún no has iniciado. ¿Volver al programador?')) return;
        clearInterval(timerInterval); isPaused = true; releaseWakeLock(); showInterface('programmer-section'); return;
    }
    if (!confirm('¿Pausar rutina? Podrás retomarla en 14 horas.')) return;
    const pauseState = { routine: JSON.parse(JSON.stringify(currentRoutine)), queue: JSON.parse(JSON.stringify(queue)), queueIndex: currentQueueIndex, timeLeft: timeLeftInPhase, timestamp: Date.now(), scheduledDay: currentScheduledDay, bodyPart: document.getElementById('body-part').value };
    localStorage.setItem('paused_routine', JSON.stringify(pauseState));
    clearInterval(timerInterval); isPaused = true; releaseWakeLock(); showInterface('programmer-section');
    alert('✅ Rutina pausada. Retómala en 14h desde el ejecutor.');
}

function checkPausedRoutine() {
    const paused = localStorage.getItem('paused_routine'); if (!paused) return false;
    const state = JSON.parse(paused);
    const hoursPassed = (Date.now() - state.timestamp) / (1000*60*60);
    if (hoursPassed >= 14) { localStorage.removeItem('paused_routine'); alert('⚠️ La rutina pausada expiró (14h).'); return false; }
    const hLeft = Math.floor(14-hoursPassed); const mLeft = Math.floor((14-hoursPassed-hLeft)*60);
    if (confirm(`🔄 Rutina pausada hace ${Math.floor(hoursPassed*60)} min.\n¿Retomar?\n(Quedan: ${hLeft}h ${mLeft}m)`)) { resumeRoutine(state); return true; }
    else { if (confirm('¿Descartar?')) localStorage.removeItem('paused_routine'); return false; }
}

function resumeRoutine(state) {
    currentRoutine = state.routine; queue = state.queue; currentQueueIndex = state.queueIndex;
    timeLeftInPhase = state.timeLeft; currentScheduledDay = state.scheduledDay;
    showInterface('executor-section'); updateTimerUI(queue[currentQueueIndex]);
    document.getElementById('btn-start-pause').innerText = 'Reanudar'; isPaused = true;
    speak("Rutina retomada. Presiona reanudar.", 1.1);
}

function clearRoutine() {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 }; editIndex = -1;
    clearFormInputs(); document.getElementById('total-time-display').innerText = '00:00';
    document.getElementById('exercise-list').innerHTML = '';
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    updateDayInfo(currentScheduledDay, false);
}

// ==========================================
// 5. HISTORIAL
// ==========================================
async function saveHistory() {
    const record = { user_id: currentUser ? currentUser.id : 'guest', date: new Date().toISOString().split('T')[0], body_part: document.getElementById('body-part').value, day: currentScheduledDay, exercises: currentRoutine.exercises, total_time: currentRoutine.totalTime, rest_between_exercises: currentRoutine.restBetweenExercises || 0 };
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]'); history.push(record);
    localStorage.setItem('gym_history', JSON.stringify(history));
    if (navigator.onLine && currentUser) await supabaseClient.from('routines').insert(record);
}

async function loadHistory() {
    const sixWeeksAgo = new Date(); sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history = history.filter(h => new Date(h.date) >= sixWeeksAgo);
    localStorage.setItem('gym_history', JSON.stringify(history));
    if (navigator.onLine && currentUser) {
        const { data } = await supabaseClient.from('routines').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
        if (data) history = [...data, ...history].filter((v,i,a) => a.findIndex(t => (t.date===v.date && t.body_part===v.body_part && JSON.stringify(t.exercises)===JSON.stringify(v.exercises))) === i);
    }
    history.sort((a,b) => new Date(b.date) - new Date(a.date));
    allHistoryData = history; renderHistoryStats(history); applyHistoryFilters();
}

function renderHistoryStats(history) {
    const total = history.length;
    const time = history.reduce((s,r) => s + (r.total_time||0), 0);
    const streak = calculateStreak(history);
    const favDay = getFavoriteDay(history);
    document.getElementById('history-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">🏋️</div><div class="stat-value">${total}</div><div class="stat-label">Rutinas</div></div>
            <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-value">${formatTime(time)}</div><div class="stat-label">Tiempo total</div></div>
            <div class="stat-card"><div class="stat-icon">🔥</div><div class="stat-value">${streak}</div><div class="stat-label">Racha (días)</div></div>
            <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${favDay||'-'}</div><div class="stat-label">Día favorito</div></div>
        </div>`;
}

function calculateStreak(history) {
    if (!history.length) return 0;
    const uniqueDates = [...new Set(history.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a));
    let streak = 0; const today = new Date(); today.setHours(0,0,0,0);
    for (let i=0; i<uniqueDates.length; i++) {
        const check = new Date(today); check.setDate(today.getDate()-i);
        if (uniqueDates.includes(check.toISOString().split('T')[0])) streak++; else break;
    }
    return streak;
}

function getFavoriteDay(history) {
    if (!history.length) return null;
    const dc = {}; history.forEach(h => dc[h.day] = (dc[h.day]||0)+1);
    return Object.keys(dc).reduce((a,b) => dc[a]>dc[b]?a:b);
}

function applyHistoryFilters() {
    const search = document.getElementById('history-search').value.toLowerCase();
    const filterDay = document.getElementById('filter-day').value;
    const filterType = document.getElementById('filter-type').value;
    let filtered = allHistoryData.filter(item => {
        const ms = !search || item.exercises.some(e => e.name.toLowerCase().includes(search));
        const md = !filterDay || item.day === filterDay;
        const mt = !filterType || item.body_part === filterType;
        return ms && md && mt;
    });
    renderHistoryList(filtered);
}

function renderHistoryList(history) {
    const container = document.getElementById('history-list');
    if (!history.length) { container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay registros.</p>'; return; }
    container.innerHTML = history.map((item) => {
        const icon = item.body_part==='Tren Superior'?'💪':item.body_part==='Tren Inferior'?'🦵':'🏃';
        const exList = item.exercises.map(e=>e.name).join(', ');
        const uniCount = item.exercises.filter(e=>e.equipment!=='Sin equipo'&&e.quantity===1).length;
        return `<div class="history-item">
            <button class="delete-btn" onclick="deleteHistory(${allHistoryData.indexOf(item)})">×</button>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="font-size:28px;">${icon}</span>
                <div style="flex:1;"><h3 style="margin:0;color:#0C047D;font-size:16px;">${item.date}</h3>
                <p style="margin:2px 0 0 0;font-size:12px;color:#666;">${item.day} • ${item.body_part}</p></div>
            </div>
            <div style="background:#f8f9fa;padding:10px;border-radius:8px;margin-bottom:8px;">
                <p style="margin:0;font-size:13px;"><strong>⏱️ ${formatTime(item.total_time)}</strong> • ${item.exercises.length} ej${uniCount>0?` (${uniCount} unilateral)`:''}</p>
                <p style="margin:5px 0 0 0;font-size:12px;color:#666;"><small>${exList}</small></p>
            </div>
            <button onclick='reuseRoutine(${allHistoryData.indexOf(item)})' style="width:100%;padding:8px;background:#0C047D;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;">🔄 Reutilizar</button>
        </div>`;
    }).join('');
}

function reuseRoutine(index) {
    const item = allHistoryData[index]; if (!item) return;
    if (currentRoutine.exercises.length > 0 && !confirm('¿Reemplazar la rutina actual?')) return;
    currentRoutine = { exercises: JSON.parse(JSON.stringify(item.exercises)), totalTime: item.total_time, restBetweenExercises: item.rest_between_exercises||0 };
    currentScheduledDay = item.day;
    document.getElementById('routine-day').value = item.day;
    document.getElementById('body-part').value = item.body_part;
    document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises||0)/60);
    renderExerciseList();
    document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
    updateDayInfo(item.day, true); showInterface('programmer-section');
    alert('✅ Rutina cargada en el programador.');
}

function deleteHistory(index) {
    if (!confirm('¿Eliminar este registro?')) return;
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.splice(index, 1); localStorage.setItem('gym_history', JSON.stringify(history));
    loadHistory();
}

// ==========================================
// 6. UTILIDADES
// ==========================================
function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => { el.classList.remove('active'); el.classList.add('hidden'); });
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');
    if (id === 'executor-section') setTimeout(() => checkPausedRoutine(), 300);
}

function syncToSupabase() { if (navigator.onLine && currentUser) { /* Sync */ } }
window.addEventListener('online', syncToSupabase);
