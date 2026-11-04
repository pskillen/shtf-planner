export function Footer() {
  return (
    <footer className="footer" data-testid="footer">
      SHTF Planner · {__BUILD_ENV__} · {__BUILD_VERSION__}
    </footer>
  );
}
