<script lang="ts">
  import { Button, ButtonGroup, Card, Badge, Modal, Range, Label, Progressbar, Toast } from 'flowbite-svelte';
  import {
    PlayOutline,
    PauseOutline,
    RefreshOutline,
    ExpandOutline,
    CompressOutline,
    AdjustmentsHorizontalOutline,
    UserAddOutline,
    UserOutline,
    TrashBinOutline,
    ForwardOutline,
    BellActiveAltOutline
  } from 'flowbite-svelte-icons';

  // ── Persisted settings ────────────────────────────────────────────────────
  const initMins = Number(localStorage.getItem('na-total-min') ?? 3);
  const initWarn = Number(localStorage.getItem('na-warning-sec') ?? 60);
  const initDanger = Number(localStorage.getItem('na-danger-sec') ?? 10);
  let totalMinutes = $state(initMins);
  let warningAt = $state(initWarn);
  let dangerAt = $state(initDanger);

  // ── Timer core ────────────────────────────────────────────────────────────
  let totalSecs = $derived(totalMinutes * 60);
  let remaining = $state(initMins * 60);
  let running = $state(false);
  let expired = $state(false);
  let alarmTarget = 0; // absolute timestamp when timer ends
  let ivId: ReturnType<typeof setInterval> | null = null;

  // ── UI state ──────────────────────────────────────────────────────────────
  let showSettings = $state(false);
  let showToast = $state(false);
  let toastMsg = $state('');
  let toastColor: 'green' | 'yellow' | 'red' = $state('green');
  let fullscreen = $state(false);
  let timerEl: HTMLElement;

  // ── Speaker queue ─────────────────────────────────────────────────────────
  let queue = $state<string[]>([]);
  let current = $state('');
  let nameInput = $state('');

  // ── Derived display ───────────────────────────────────────────────────────
  let pct = $derived(totalSecs > 0 ? ((totalSecs - remaining) / totalSecs) * 100 : 0);
  let displayMins = $derived(Math.floor(remaining / 60));
  let displaySecs = $derived(remaining % 60);
  let clock = $derived(`${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`);

  type Phase = 'idle' | 'running' | 'warning' | 'danger' | 'expired';
  let phase: Phase = $derived(expired ? 'expired' : !running ? 'idle' : remaining <= dangerAt ? 'danger' : remaining <= warningAt ? 'warning' : 'running');

  let ringStroke = $derived(phase === 'expired' || phase === 'danger' ? '#EF4444' : phase === 'warning' ? '#F59E0B' : '#10B981');

  let timeColorClass = $derived(phase === 'expired' || phase === 'danger' ? 'text-red-400' : phase === 'warning' ? 'text-yellow-300' : 'text-white');

  let barColor: 'red' | 'yellow' | 'green' = $derived(phase === 'expired' || phase === 'danger' ? 'red' : phase === 'warning' ? 'yellow' : 'green');

  let statusText = $derived(
    phase === 'expired' ? "Time's Up!" : phase === 'danger' ? `${remaining}s left!` : phase === 'warning' ? 'Warning' : running ? 'Running' : remaining === totalSecs ? 'Ready' : 'Paused'
  );

  // SVG ring — reactive to fullscreen
  let ringSize = $derived(fullscreen ? 420 : 280);
  let cx = $derived(ringSize / 2);
  let cy = $derived(ringSize / 2);
  let R = $derived(fullscreen ? 170 : 110);
  let C = $derived(2 * Math.PI * R);
  let dashOffset = $derived(C * (1 - pct / 100));

  // ── Audio (Web Audio API) ─────────────────────────────────────────────────
  let audioCtx: AudioContext | null = null;

  function getAudioCtx(): AudioContext | null {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtx) audioCtx = new AudioCtx();
      return audioCtx;
    } catch {
      return null;
    }
  }

  // Must be called from a user gesture to unlock audio on iOS
  function unlockAudio() {
    // iOS 17+: set session to "playback" so audio fires even when muted
    if ('audioSession' in navigator) {
      (navigator as any).audioSession.type = 'playback';
    }
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function beep(freq: number, dur: number, vol = 0.5) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      /* audio unavailable */
    }
  }

  function warnChime() {
    beep(880, 0.2);
    setTimeout(() => beep(880, 0.2), 300);
  }

  function expireChime() {
    beep(440, 0.35);
    setTimeout(() => beep(554, 0.35), 450);
    setTimeout(() => beep(659, 0.55), 900);
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  function notify(msg: string, color: typeof toastColor = 'green') {
    toastMsg = msg;
    toastColor = color;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 4000);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Share Timer', { body: msg });
    }
  }

  // ── Timer logic ───────────────────────────────────────────────────────────
  function tick() {
    if (!running) return;
    const left = Math.max(0, Math.round((alarmTarget - Date.now()) / 1000));
    remaining = left;
    if (left <= 0 && running) {
      fire();
    } else if (left === warningAt) {
      warnChime();
      notify(`${Math.round(warningAt / 60)} minute${warningAt >= 120 ? 's' : ''} remaining`, 'yellow');
    } else if (left === dangerAt) {
      warnChime();
      notify(`${dangerAt} seconds left!`, 'red');
    }
  }

  function fire() {
    stop();
    expired = true;
    remaining = 0;
    expireChime();
    notify('Time is up! Thank you.', 'red');
  }

  function start() {
    if (remaining === 0 || expired) return;
    unlockAudio();
    expired = false;
    running = true;
    alarmTarget = Date.now() + remaining * 1000;
    ivId = setInterval(tick, 500); // 500ms for reliability
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFoc);
  }

  function pause() {
    running = false;
    if (ivId) {
      clearInterval(ivId);
      ivId = null;
    }
  }

  function stop() {
    running = false;
    if (ivId) {
      clearInterval(ivId);
      ivId = null;
    }
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', onFoc);
  }

  function reset() {
    stop();
    expired = false;
    remaining = totalSecs;
  }

  // Re-check when tab becomes visible or window regains focus
  function onVis() {
    if (!document.hidden && running) tick();
  }
  function onFoc() {
    if (running) tick();
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────
  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await timerEl?.requestFullscreen?.();
    } else {
      await document.exitFullscreen();
    }
  }

  $effect(() => {
    const h = () => {
      fullscreen = !!document.fullscreenElement;
    };
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  let sMins = $state(0);
  let sWarn = $state(0);
  let sDanger = $state(0);

  function openSettings() {
    sMins = totalMinutes;
    sWarn = warningAt;
    sDanger = dangerAt;
    showSettings = true;
  }

  function saveSettings() {
    totalMinutes = sMins;
    warningAt = sWarn;
    dangerAt = sDanger;
    localStorage.setItem('na-total-min', String(totalMinutes));
    localStorage.setItem('na-warning-sec', String(warningAt));
    localStorage.setItem('na-danger-sec', String(dangerAt));
    reset();
    showSettings = false;
  }

  // ── Share time calculator ─────────────────────────────────────────────────
  let calcMins = $state(60);
  let calcPeople = $state(10);

  let calcPerPersonSecs = $derived(calcPeople > 0 ? Math.round((calcMins * 60) / calcPeople / 15) * 15 : 0);
  let calcDisplay = $derived(`${String(Math.floor(calcPerPersonSecs / 60)).padStart(2, '0')}:${String(calcPerPersonSecs % 60).padStart(2, '0')}`);

  function applyCalcTime() {
    const mins = calcPerPersonSecs / 60;
    totalMinutes = mins;
    localStorage.setItem('na-total-min', String(mins));
    reset();
    notify(`Timer set to ${calcDisplay} per person`, 'green');
  }

  // ── Queue ─────────────────────────────────────────────────────────────────
  function enqueue() {
    const n = nameInput.trim() || 'Anonymous';
    queue = [...queue, n];
    nameInput = '';
  }

  function dequeue(i: number) {
    queue = queue.filter((_, idx) => idx !== i);
  }

  function nextSpeaker() {
    if (!queue.length) return;
    current = queue[0];
    queue = queue.slice(1);
    reset();
    start();
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (running) {
          pause();
        } else {
          start();
        }
      }
      if (e.code === 'KeyR') reset();
      if (e.code === 'KeyF') toggleFullscreen();
      if (e.code === 'KeyN') nextSpeaker();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Request browser notification permission on load
  $effect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
</script>

<div bind:this={timerEl} class="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4">
  <!-- Header (hidden in fullscreen) -->
  {#if !fullscreen}
    <div class="mb-8 text-center">
      <h1 class="text-3xl font-bold tracking-tight text-white">Share Timer</h1>
      <p class="mt-1 text-sm text-gray-500">12-Step Share Timer</p>
    </div>
  {/if}

  <!-- Current speaker badge -->
  {#if current}
    <div class="mb-5">
      <Badge color="indigo" class="gap-1 px-4 py-2 text-sm font-medium">
        <UserOutline class="h-4 w-4" />
        {current}
      </Badge>
    </div>
  {/if}

  <!-- SVG countdown ring -->
  <div class="relative mb-6 flex items-center justify-center" style="width:{ringSize}px; height:{ringSize}px">
    <svg width={ringSize} height={ringSize} viewBox="0 0 {ringSize} {ringSize}" class="absolute">
      <!-- Track ring -->
      <circle {cx} {cy} r={R} fill="none" stroke="#1F2937" stroke-width="14" />
      <!-- Progress ring -->
      <circle
        {cx}
        {cy}
        r={R}
        fill="none"
        stroke={ringStroke}
        stroke-width="14"
        stroke-linecap="round"
        stroke-dasharray={C}
        stroke-dashoffset={dashOffset}
        transform="rotate(-90 {cx} {cy})"
        style="transition: stroke-dashoffset 0.6s ease, stroke 0.4s ease"
        class:pulse-ring={phase === 'expired'}
      />
    </svg>

    <!-- Clock display -->
    <div class="relative z-10 text-center select-none">
      <div class="font-mono leading-none font-bold {timeColorClass} {fullscreen ? 'text-8xl' : 'text-5xl'}" class:pulse-text={phase === 'expired'}>
        {clock}
      </div>
      <div class="mt-2 text-xs font-semibold tracking-[0.2em] uppercase {timeColorClass} opacity-60">
        {statusText}
      </div>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="mb-7 w-full {fullscreen ? 'max-w-lg' : 'max-w-xs'}">
    <Progressbar progress={pct} color={barColor} size="h-2" />
  </div>

  <!-- Controls -->
  <ButtonGroup class="mb-8">
    {#if !running}
      <Button color="green" onclick={start} disabled={remaining === 0 || expired}>
        <PlayOutline class="me-2 h-5 w-5" />
        Start
      </Button>
    {:else}
      <Button color="yellow" onclick={pause}>
        <PauseOutline class="me-2 h-5 w-5" />
        Pause
      </Button>
    {/if}
    <Button color="red" outline onclick={reset}>
      <RefreshOutline class="me-2 h-5 w-5" />
      Reset
    </Button>
    <Button color="dark" onclick={toggleFullscreen} class="hidden sm:flex">
      {#if fullscreen}
        <CompressOutline class="me-2 h-5 w-5" />
        Exit Full
      {:else}
        <ExpandOutline class="me-2 h-5 w-5" />
        Full
      {/if}
    </Button>
    {#if !fullscreen}
      <Button color="dark" onclick={openSettings} title="Settings">
        <AdjustmentsHorizontalOutline class="h-5 w-5" />
      </Button>
    {/if}
  </ButtonGroup>

  <!-- Speaker queue (hidden in fullscreen) -->
  {#if !fullscreen}
    <Card class="w-full max-w-sm !border-gray-700 !bg-gray-900">
      <div class="mb-3 flex items-center gap-2">
        <UserAddOutline class="h-5 w-5 text-gray-400" />
        <span class="font-semibold text-white">Speaker Queue</span>
        {#if queue.length > 0}
          <Badge color="blue">{queue.length}</Badge>
        {/if}
      </div>

      <!-- Add speaker input -->
      <div class="mb-3 flex gap-2">
        <input
          bind:value={nameInput}
          placeholder="Name (blank = Anonymous)"
          class="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          onkeydown={(e) => e.key === 'Enter' && enqueue()}
        />
        <Button size="sm" onclick={enqueue}>Add</Button>
      </div>

      <!-- Queue list -->
      {#if queue.length > 0}
        <div class="mb-3 max-h-44 space-y-2 overflow-y-auto pr-1">
          {#each queue as name, i (name + i)}
            <div class="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2">
              <span class="text-sm text-gray-200">
                <Badge color="gray" class="me-2">{i + 1}</Badge>{name}
              </span>
              <button onclick={() => dequeue(i)} class="text-gray-500 transition-colors hover:text-red-400">
                <TrashBinOutline class="h-4 w-4" />
              </button>
            </div>
          {/each}
        </div>
        <Button color="blue" class="w-full" onclick={nextSpeaker}>
          <ForwardOutline class="me-2 h-4 w-4" />
          Start Next Speaker
        </Button>
      {:else}
        <p class="py-3 text-center text-sm text-gray-600">Add speakers above to build the queue</p>
      {/if}
    </Card>

    <!-- Share time calculator -->
    <Card class="mt-4 w-full max-w-sm !border-gray-700 !bg-gray-900">
      <div class="mb-3 flex items-center gap-2">
        <AdjustmentsHorizontalOutline class="h-5 w-5 text-gray-400" />
        <span class="font-semibold text-white">Share Time Calculator</span>
      </div>

      <div class="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label for="calc-mins" class="mb-1 block text-xs text-gray-400">Meeting minutes</label>
          <input
            id="calc-mins"
            type="number"
            inputmode="numeric"
            min={1}
            max={300}
            bind:value={calcMins}
            class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label for="calc-people" class="mb-1 block text-xs text-gray-400">People in room</label>
          <input
            id="calc-people"
            type="number"
            inputmode="numeric"
            min={1}
            max={200}
            bind:value={calcPeople}
            class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div class="mb-3 rounded-lg bg-gray-800 px-4 py-3 text-center">
        <p class="mb-0.5 text-xs text-gray-500">Each person gets</p>
        <p class="font-mono text-3xl font-bold text-green-400">{calcDisplay}</p>
        <p class="mt-0.5 text-xs text-gray-500">({calcPerPersonSecs}s · nearest 15s)</p>
      </div>

      <Button color="blue" class="w-full" onclick={applyCalcTime} disabled={calcPerPersonSecs === 0}>Apply to Timer</Button>
    </Card>

    <!-- Keyboard hints -->
    <p class="mt-4 hidden text-center text-xs text-gray-700 sm:block">Space · Start/Pause &nbsp;|&nbsp; R · Reset &nbsp;|&nbsp; F · Fullscreen &nbsp;|&nbsp; N · Next speaker</p>
  {/if}
</div>

<!-- Settings modal -->
<Modal
  title="Timer Settings"
  bind:open={showSettings}
  size="sm"
  class="!bg-gray-900"
  classes={{ header: '!bg-gray-900 !border-gray-700 !text-white', body: '!bg-gray-900', footer: '!bg-gray-900 !border-gray-700' }}
>
  <div class="space-y-6">
    <div>
      <Label class="mb-2 block font-medium text-white">Share duration: <span class="text-blue-400">{sMins} min</span></Label>
      <Range min={1} max={15} bind:value={sMins} />
      <div class="mt-1 flex justify-between text-xs text-gray-500">
        <span>1 min</span><span>15 min</span>
      </div>
    </div>

    <div>
      <Label class="mb-2 block font-medium text-white">
        Warning at: <span class="text-yellow-400">{sWarn}s remaining</span>
        {#if sWarn >= 60}
          <span class="text-gray-500">({Math.round(sWarn / 60)}m)</span>
        {/if}
      </Label>
      <Range min={10} max={120} step={10} bind:value={sWarn} />
      <div class="mt-1 flex justify-between text-xs text-gray-500">
        <span>10s</span><span>120s</span>
      </div>
    </div>

    <div>
      <Label class="mb-2 block font-medium text-white">
        Alarm at: <span class="text-red-400">{sDanger}s remaining</span>
      </Label>
      <Range min={5} max={30} step={5} bind:value={sDanger} />
      <div class="mt-1 flex justify-between text-xs text-gray-500">
        <span>5s</span><span>30s</span>
      </div>
    </div>

    <div class="rounded-lg bg-gray-800 p-3 text-xs text-gray-400">
      <BellActiveAltOutline class="mb-1 inline h-4 w-4 text-yellow-400" />
      Audio beeps + browser notifications will fire at warning and alarm thresholds.
    </div>
  </div>

  {#snippet footer()}
    <Button onclick={saveSettings}>Save &amp; Reset Timer</Button>
    <Button color="dark" onclick={() => (showSettings = false)}>Cancel</Button>
  {/snippet}
</Modal>

<!-- Toast notifications -->
{#if showToast}
  <Toast color={toastColor} position="bottom-right" dismissable={false} class="!bg-gray-900 !text-white !border-gray-700">
    {toastMsg}
  </Toast>
{/if}

<style>
  @keyframes pulse-ring {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }

  @keyframes pulse-text {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  :global(.pulse-ring) {
    animation: pulse-ring 1s ease-in-out infinite;
  }

  :global(.pulse-text) {
    animation: pulse-text 1s ease-in-out infinite;
  }
</style>
