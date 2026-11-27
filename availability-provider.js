(function (window) {
  window.oneManAndAVanAvailabilityProvider = {
    async getMonthAvailability(year, monthIndex) {
      const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      const response = await fetch(`/api/availability?month=${encodeURIComponent(month)}`, {
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Availability request failed with status ${response.status}.`);
      }

      const result = await response.json();
      if (!result || !result.availability || typeof result.availability !== "object") {
        throw new Error("Availability response has an invalid format.");
      }

      return result.availability;
    }
  };
})(window);
