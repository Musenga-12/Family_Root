/** Downscale an image file to a JPEG data URL so it fits comfortably in localStorage. Resolves null if it isn't a readable image. */
export const shrinkImage = (file, maxSide = 900, quality = 0.72) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => res(null);
    img.src = r.result;
  };
  r.onerror = () => res(null);
  r.readAsDataURL(file);
});
