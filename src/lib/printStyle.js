/* The stylesheet of the print window (Legacy Archive → Print). The window inherits the app's Content-Security-Policy,
   which allows inline styles only by their hash, so vite.config.js reads this same string to add that hash. */
export const PRINT_CSS = "body{font:16px/1.6 Georgia,serif;max-width:640px;margin:40px auto;color:#111}h1{font-size:22px}small{color:#555}";
