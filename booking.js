(function () {
  const googleBookingUrl = "https://calendar.app.google/D5b9z6wF8Skt1Yhb8";
  const provider = window.oneManAndAVanAvailabilityProvider;
  const previousMonthButton = document.getElementById("previous-month");
  const nextMonthButton = document.getElementById("next-month");
  const monthLabel = document.getElementById("calendar-month");
  const calendarDays = document.getElementById("calendar-days");
  const calendarStatus = document.getElementById("calendar-status");
  const bookingSourceLabel = document.getElementById("booking-source-label");
  const dialog = document.getElementById("availability-dialog");
  const closeDialogButton = document.getElementById("close-availability");
  const selectedDateHeading = document.getElementById("selected-date");
  const bookingTimes = document.getElementById("booking-times");
  const bookingSelection = document.getElementById("booking-selection");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let availability = {};
  let selectedDateKey = "";

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(date, options) {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }

  function formatTime(time) {
    const [hour, minute] = time.split(":").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: minute === 0 ? undefined : "2-digit"
    }).format(new Date(2000, 0, 1, hour, minute));
  }

  function renderCalendar() {
    monthLabel.textContent = formatDate(visibleMonth, { month: "long", year: "numeric" });
    const isCurrentMonth = visibleMonth.getFullYear() === today.getFullYear()
      && visibleMonth.getMonth() === today.getMonth();
    previousMonthButton.disabled = isCurrentMonth;
    calendarDays.replaceChildren();

    const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    for (let emptyDay = 0; emptyDay < firstWeekday; emptyDay += 1) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-empty";
      spacer.setAttribute("aria-hidden", "true");
      calendarDays.append(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
      const key = dateKey(date);
      const slots = availability[key] || [];
      const isPast = date < today;
      const dateButton = document.createElement("button");
      dateButton.type = "button";
      dateButton.className = "calendar-day";
      dateButton.textContent = String(day);
      dateButton.disabled = isPast || slots.length === 0;
      dateButton.setAttribute("aria-pressed", String(key === selectedDateKey));
      dateButton.setAttribute("aria-label", `${formatDate(date, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      })}${slots.length ? `, ${slots.length} times available` : ", no availability"}`);

      if (isPast) dateButton.classList.add("is-past");
      else if (slots.length) dateButton.classList.add("has-availability");
      else dateButton.classList.add("is-unavailable");
      if (key === dateKey(today)) dateButton.classList.add("is-today");
      if (key === selectedDateKey) dateButton.classList.add("is-selected");
      if (slots.length) dateButton.addEventListener("click", () => openAvailability(date, slots));
      calendarDays.append(dateButton);
    }
  }

  function openAvailability(date, slots) {
    selectedDateKey = dateKey(date);
    selectedDateHeading.textContent = formatDate(date, {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    bookingSelection.textContent = "Google will ask you to select your quote appointment time again.";
    bookingTimes.replaceChildren();

    slots.forEach((time) => {
      const timeButton = document.createElement("a");
      timeButton.href = googleBookingUrl;
      timeButton.target = "_blank";
      timeButton.rel = "noopener noreferrer";
      timeButton.className = "booking-time";
      timeButton.textContent = formatTime(time);
      timeButton.setAttribute("aria-label", `${formatTime(time)} quote appointment time, opens Google scheduling in a new tab`);
      timeButton.addEventListener("click", () => {
        bookingSelection.textContent = `Opening Google to schedule your free quote at ${formatTime(time)} on ${selectedDateHeading.textContent}. Select the date and time again there.`;
      });
      bookingTimes.append(timeButton);
    });

    renderCalendar();
    dialog.showModal();
  }

  async function loadVisibleMonth() {
    previousMonthButton.disabled = true;
    nextMonthButton.disabled = true;
    bookingSourceLabel.lastChild.textContent = " Connecting to Google Calendar…";
    calendarStatus.textContent = "Loading live availability…";

    try {
      availability = await provider.getMonthAvailability(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth()
      );
      renderCalendar();
      bookingSourceLabel.lastChild.textContent = " Live Google Calendar availability";
      calendarStatus.textContent = "Choose a highlighted day to see available times.";
    } catch (error) {
      console.error("Could not load booking availability.", error);
      availability = {};
      renderCalendar();
      bookingSourceLabel.lastChild.textContent = " Google Calendar unavailable";
      calendarStatus.textContent = "Live availability could not be loaded. Please try again later.";
    } finally {
      const isCurrentMonth = visibleMonth.getFullYear() === today.getFullYear()
        && visibleMonth.getMonth() === today.getMonth();
      previousMonthButton.disabled = isCurrentMonth;
      nextMonthButton.disabled = false;
    }
  }

  previousMonthButton.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    loadVisibleMonth();
  });
  nextMonthButton.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    loadVisibleMonth();
  });
  closeDialogButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    selectedDateKey = "";
    renderCalendar();
  });

  loadVisibleMonth();
})();
