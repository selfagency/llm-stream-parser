/**
 * SAFE_PATH restricts PATH to system directories only, preventing
 * hijacking via a writable directory on the user's PATH.
 */
const SAFE_PATH_UNIX = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
const SAFE_PATH_WIN = [
  String.raw`${process.env.SystemDrive || 'C:'}\Windows\System32`,
  String.raw`${process.env.SystemDrive || 'C:'}\Windows`
].join(';');

export function safePathEnv(): NodeJS.ProcessEnv {
  const safePath = process.platform === 'win32' ? SAFE_PATH_WIN : SAFE_PATH_UNIX;
  return { ...process.env, PATH: safePath };
}
