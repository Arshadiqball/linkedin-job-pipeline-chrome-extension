(function registerTiming(globalObj) {
  const ns = (globalObj.LinkedInTopContent = globalObj.LinkedInTopContent || {});

  function randomInt(min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  function jitter(baseMs, spreadMs) {
    const delta = randomInt(-Math.abs(spreadMs), Math.abs(spreadMs));
    return Math.max(0, baseMs + delta);
  }

  function cancellableDelay(totalMs, shouldContinue, onTick) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, totalMs - elapsed);
        if (typeof shouldContinue === "function" && !shouldContinue()) {
          return reject(new Error("STOPPED"));
        }
        if (typeof onTick === "function") onTick(remaining);
        if (remaining <= 0) return resolve();
        const nextTick = Math.min(250, remaining);
        setTimeout(check, nextTick);
      };
      check();
    });
  }

  async function randomDelay(minMs, maxMs, shouldContinue, onTick) {
    const ms = randomInt(minMs, maxMs);
    await cancellableDelay(ms, shouldContinue, onTick);
    return ms;
  }

  ns.timing = { randomInt, jitter, randomDelay, cancellableDelay };
})(globalThis);
