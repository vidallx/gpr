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
// Función para enviar el correo de recuperación de contraseña
async function resetPassword() {
    const email = document.getElementById('login-email').value;
    if (!email) return showMessage('Por favor, ingresa tu correo electrónico.');

    // Envía un enlace mágico al correo del usuario para que cree una nueva contraseña
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://tu-dominio.com/reset-password', // Opcional: URL a tu página de reset
    });

    if (error) {
        showMessage('Error: ' + error.message);
    } else {
        showMessage('Se ha enviado un enlace de recuperación a tu correo.');
    }
}


async function register() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return showMessage(error.message);
    showMessage('Registro exitoso. Por favor inicia sesión.');
}

function showMessage(msg) {
    document.getElementById('auth-message').innerText = msg;
}

function initApp() {
    showInterface('programmer-section');
    speakRandomGreeting(currentUser.email ? currentUser.email.split('@')[0] : 'Atleta');
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
    speak(randomPhrase);
}

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Evita acumulación de frases
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 1.15; // Un poco más rápido para fluidez
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 3. PROGRAMADOR DE RUTINAS
// ==========================================
function addExercise() {
    const ex = {
        name: document.getElementById('ex-name').value,
        sets: parseInt(document.getElementById('ex-sets').value) || 1,
        reps: parseInt(document.getElementById('ex-reps').value) || 1,
        weight: document.getElementById('ex-weight').value,
        tempo: {
            ecc: parseInt(document.getElementById('tempo-ecc').value) || 0,
            pb: parseInt(document.getElementById('tempo-pb').value) || 0,
            con: parseInt(document.getElementById('tempo-con').value) || 0,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0
        },
        rest: {
            // ELIMINADO: rep: parseInt(...)
            set: parseInt(document.getElementById('rest-set').value) || 0,
            ex: parseInt(document.getElementById('rest-ex').value) || 0
        }
    };

    if (!ex.name) return alert('Ingresa un nombre de ejercicio');

    currentRoutine.exercises.push(ex);
    calculateTotalTime();
    renderExerciseList();
    
    document.getElementById('ex-name').value = '';
}

function calculateTotalTime() {
    let total = 40; // 40s de preparación inicial
    currentRoutine.exercises.forEach(ex => {
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
        // ELIMINADO: + ex.rest.rep del cálculo
        const setTime = (repCycle * ex.reps) + ex.rest.set;
        total += (setTime * ex.sets) + ex.rest.ex;
    });
    currentRoutine.totalTime = total;
    document.getElementById('total-time-display').innerText = total;
}

function renderExerciseList() {
    const list = document.getElementById('exercise-list');
    list.innerHTML = currentRoutine.exercises.map((ex, i) => 
        `<li>${i+1}. ${ex.name} (${ex.sets}x${ex.reps}) - ${ex.weight}kg</li>`
    ).join('');
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    
    localStorage.setItem('pending_routine', JSON.stringify(currentRoutine));
    syncToSupabase();
    
    buildTimerQueue();
    showInterface('executor-section');
    speak("Dispondrás de 40 segundos para prepararte");
}

// ==========================================
// 4. EJECUTOR (CRONOMETRAJE Y AUDIO AVANZADO)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    switch(type) {
        case 'eccentric':
            const oscEcc = audioCtx.createOscillator();
            const gainEcc = audioCtx.createGain();
            oscEcc.connect(gainEcc); gainEcc.connect(audioCtx.destination);
            oscEcc.type = 'sine';
            oscEcc.frequency.setValueAtTime(250, now);
            oscEcc.frequency.exponentialRampToValueAtTime(150, now + 0.5);
            gainEcc.gain.setValueAtTime(0.5, now);
            gainEcc.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            oscEcc.start(now); oscEcc.stop(now + 0.8);
            break;

        case 'pause-bottom':
            playDoubleBeep(now);
            break;

        case 'concentric':
            const oscCon = audioCtx.createOscillator();
            const gainCon = audioCtx.createGain();
            oscCon.connect(gainCon); gainCon.connect(audioCtx.destination);
            oscCon.type = 'sine';
            oscCon.frequency.setValueAtTime(900, now);
            oscCon.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
            gainCon.gain.setValueAtTime(0.5, now);
            gainCon.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            oscCon.start(now); oscCon.stop(now + 0.8);
            break;

        case 'pause-top':
            playTripleBeep(now);
            break;

        case 'metronome':
            const oscMet = audioCtx.createOscillator();
            const gainMet = audioCtx.createGain();
            oscMet.connect(gainMet); gainMet.connect(audioCtx.destination);
            oscMet.type = 'square';
            oscMet.frequency.setValueAtTime(1000, now);
            oscMet.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            gainMet.gain.setValueAtTime(0.2, now);
            gainMet.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            oscMet.start(now); oscMet.stop(now + 0.05);
            break;

        case 'transition':
            const oscTrans = audioCtx.createOscillator();
            const gainTrans = audioCtx.createGain();
            oscTrans.connect(gainTrans); gainTrans.connect(audioCtx.destination);
            oscTrans.type = 'sine';
            oscTrans.frequency.setValueAtTime(400, now);
            oscTrans.frequency.linearRampToValueAtTime(800, now + 0.3);
            gainTrans.gain.setValueAtTime(0.4, now);
            gainTrans.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            oscTrans.start(now); oscTrans.stop(now + 0.3);
            break;
    }
}

function playDoubleBeep(time) {
    const osc1 = audioCtx.createOscillator(); const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
    osc1.connect(gain1); osc2.connect(gain2);
    gain1.connect(audioCtx.destination); gain2.connect(audioCtx.destination);
    
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(600, time);
    gain1.gain.setValueAtTime(0.3, time); gain1.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc1.start(time); osc1.stop(time + 0.1);
    
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(600, time + 0.2);
    gain2.gain.setValueAtTime(0.3, time + 0.2); gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc2.start(time + 0.2); osc2.stop(time + 0.3);
}

function playTripleBeep(time) {
    for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, time + (i * 0.15));
        gain.gain.setValueAtTime(0.2, time + (i * 0.15));
        gain.gain.exponentialRampToValueAtTime(0.01, time + (i * 0.15) + 0.08);
        osc.start(time + (i * 0.15)); osc.stop(time + (i * 0.15) + 0.08);
    }
}

function buildTimerQueue() {
    queue = [];
    queue.push({ phase: 'Preparación', duration: 40, action: 'prep' });

    currentRoutine.exercises.forEach((ex, exIndex) => {
        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                const isFirstRep = (r === 1);
                const phases = [];
                
                if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                if (ex.tempo.con > 0) phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });

                // Asignamos el nombre del ejercicio y el número de serie a cada fase
                phases.forEach((p, index) => {
                    queue.push({
                        ...p,
                        exerciseName: ex.name,
                        setNumber: s,
                        // Solo anunciamos el nombre en la MUY PRIMERA fase de la primera repetición
                        isFirstPhaseOfRep: (isFirstRep && index === 0)
                    });
                });

                // ELIMINADO: Descanso entre repeticiones
            }
            
            if (s < ex.sets && ex.rest.set > 0) {
                queue.push({ phase: 'Descanso entre series', duration: ex.rest.set, action: 'rest' });
            }
        }
        
        if (exIndex < currentRoutine.exercises.length - 1 && ex.rest.ex > 0) {
            queue.push({ phase: 'Descanso entre ejercicios', duration: ex.rest.ex, action: 'rest-exercise' });
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

    // ANUNCIOS DE VOZ AL INICIO EXACTO DE LA FASE
    if (item.action === 'prep' && timeLeftInPhase === 40) {
        speak("Comienza la preparación");
    } 
    else if (item.action === 'ecc') {
        if (item.isFirstPhaseOfRep) {
            speak(`Serie ${item.setNumber}, ${item.exerciseName}. Exce`);
        } else {
            speak("Exce");
        }
        playSound('eccentric');
    } 
    else if (item.action === 'pause-bottom') {
        if (item.isFirstPhaseOfRep) speak(`Serie ${item.setNumber}, ${item.exerciseName}`);
        else speak("Pausa abajo");
        playSound('pause-bottom');
    }
    else if (item.action === 'con') {
        if (item.isFirstPhaseOfRep) speak(`Serie ${item.setNumber}, ${item.exerciseName}`);
        else speak("Conce");
        playSound('concentric');
    } 
    else if (item.action === 'pause-top') {
        if (item.isFirstPhaseOfRep) speak(`Serie ${item.setNumber}, ${item.exerciseName}`);
        else speak("Pausa arriba");
        playSound('pause-top');
    }
    else if (item.action === 'rest' || item.action === 'rest-exercise') {
        speak("Descanso");
        if (item.action === 'rest-exercise') playSound('transition');
    }
    else if (item.action === 'finish') {
        speak("¡Felicidades! Rutina completada");
        saveHistory();
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}

function updateTimerUI(item) {
    // Mostrar nombre del ejercicio en la pantalla si está disponible
    let title = item.phase;
    if (item.exerciseName) {
        title = `${item.exerciseName} - ${item.phase}`;
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

    // Anuncios de voz durante la cuenta regresiva
    if (currentItem.action === 'prep') {
        if (timeLeftInPhase === 20) speak("Veinte segundos");
        if (timeLeftInPhase <= 5 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString());
    } else if (currentItem.action === 'rest' || currentItem.action === 'rest-exercise') {
        if (timeLeftInPhase <= 5 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString());
    }

    // Decrementar el tiempo
    timeLeftInPhase--;
    updateTimerUI(currentItem);

    // Metrónomo en cada segundo
    if (timeLeftInPhase > 0) {
        playSound('metronome');
    }

    // Verificar si terminó la fase actual
    if (timeLeftInPhase <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) {
            loadNextPhase();
        } else {
            clearInterval(timerInterval);
            finishRoutine();
        }
    }
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPaused = !isPaused;
    document.getElementById('btn-start-pause').innerText = isPaused ? 'Reanudar' : 'Pausar';
    
    if (!isPaused) {
        timerInterval = setInterval(tick, 1000);
    } else {
        clearInterval(timerInterval);
    }
}

function finishRoutine() {
    clearInterval(timerInterval);
    speak("Rutina finalizada manualmente");
    saveHistory();
    showInterface('history-section');
}

// ==========================================
// 5. HISTORIAL Y SUPABASE
// ==========================================
async function saveHistory() {
    const record = {
        user_id: currentUser ? currentUser.id : 'guest',
        date: new Date().toISOString().split('T')[0],
        body_part: document.getElementById('body-part').value,
        day: document.getElementById('training-day').value,
        exercises: currentRoutine.exercises,
        total_time: currentRoutine.totalTime
    };

    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.push(record);
    localStorage.setItem('gym_history', JSON.stringify(history));

    if (navigator.onLine && currentUser) {
        await supabaseClient.from('routines').insert(record);
    }
}

async function loadHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '<p>Cargando...</p>';

    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history = history.filter(h => new Date(h.date) >= sixWeeksAgo);
    localStorage.setItem('gym_history', JSON.stringify(history));

    if (navigator.onLine && currentUser) {
        const { data, error } = await supabaseClient.from('routines').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
        if (data) {
            history = [...data, ...history].filter((v,i,a)=>a.findIndex(t=>(t.date===v.date && t.body_part===v.body_part))===i);
        }
    }

    container.innerHTML = '';
    if (history.length === 0) {
        container.innerHTML = '<p>No hay registros recientes.</p>';
        return;
    }

    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <button class="delete-btn" onclick="deleteHistory(${index})">×</button>
            <h3>${item.date} - ${item.body_part} (${item.day})</h3>
            <p>Tiempo total: ${item.total_time}s</p>
            <p><small>${item.exercises.map(e => e.name).join(', ')}</small></p>
        `;
        container.appendChild(div);
    });
}

function deleteHistory(index) {
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.splice(index, 1);
    localStorage.setItem('gym_history', JSON.stringify(history));
    loadHistory();
}

// ==========================================
// 6. UTILIDADES
// ==========================================
function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.interface').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');
}

function syncToSupabase() {
    if (navigator.onLine && currentUser) {
        // Sincronización en segundo plano
    }
}

window.addEventListener('online', syncToSupabase);
