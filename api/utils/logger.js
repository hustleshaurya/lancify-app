function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  };
}

export function createLogger(scope = 'opportunity-engine') {
  function write(level, message, meta = {}) {
    const payload = {
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      ...meta,
    };
    if (meta.error instanceof Error) {
      payload.error = serializeError(meta.error);
    }
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
