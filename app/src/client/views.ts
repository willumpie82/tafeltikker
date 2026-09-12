export function showView(id: string) {
  document.querySelectorAll<HTMLElement>(".view").forEach((el) => {
    el.hidden = el.id !== id;
  });
}
