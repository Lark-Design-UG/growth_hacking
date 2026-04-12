/**
 * 将多个 WebGL Shader 的挂载分散到连续帧，避免 IntersectionObserver 同时触发时
 * 在同一帧内创建大量上下文导致主线程长时间阻塞。
 */

type MountToken = { cancelled: boolean };

type Queued = { token: MountToken; run: () => void };

const waiters: Queued[] = [];
let rafScheduled = false;

function pump(): void {
  while (waiters.length > 0) {
    const next = waiters.shift()!;
    if (!next.token.cancelled) {
      next.run();
      break;
    }
  }
  if (waiters.length > 0) {
    requestAnimationFrame(pump);
  } else {
    rafScheduled = false;
  }
}

export function scheduleShaderMount(run: () => void): MountToken {
  const token: MountToken = { cancelled: false };
  waiters.push({ token, run });
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(pump);
  }
  return token;
}

export function cancelShaderMount(token: MountToken | null): void {
  if (token) token.cancelled = true;
}
