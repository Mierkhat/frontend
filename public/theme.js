(function () {
  var choice = "system";
  try {
    var saved = localStorage.getItem("mierkhat.theme");
    if (saved === "light" || saved === "dark") choice = saved;
  } catch (e) {}
  var theme =
    choice === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", theme === "dark" ? "#000000" : "#DEDEDE");
})();
