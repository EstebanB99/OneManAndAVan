(function (window) {
  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /*
   * Replace this demo provider with a request to a server-side calendar endpoint.
   * Return { "YYYY-MM-DD": ["09:00", ...] }; keep Google credentials off this page.
   */
  window.oneManAndAVanAvailabilityProvider = {
    async getMonthAvailability(year, monthIndex) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();
      const availability = {};
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, monthIndex, day);
        const weekday = date.getDay();
        if (date < today || weekday === 0 || weekday === 1 || day % 7 === 0) continue;

        const slots = weekday === 6
          ? ["09:00", "11:30", "13:30"]
          : ["09:00", "11:00", "13:00", "15:00"];
        const sampleCount = 2 + day % (slots.length - 1);
        const sampleSlots = slots.slice(0, sampleCount);

        if (dateKey(date) === dateKey(today)) {
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const futureSlots = sampleSlots.filter((time) => {
            const parts = time.split(":").map(Number);
            return parts[0] * 60 + parts[1] > currentMinutes;
          });
          if (futureSlots.length) availability[dateKey(date)] = futureSlots;
        } else {
          availability[dateKey(date)] = sampleSlots;
        }
      }

      return availability;
    }
  };
})(window);
