export function trackingLabel(status) {
  if (!status || status.backgroundGeofence !== true) {
    return {
      state: "unavailable",
      title: "Tracking: off",
      detail: "This browser cannot watch job sites while the phone is locked or the app is closed. Nothing is collected in the background. Enter time yourself."
    };
  }
  if (status.authorization === "denied") {
    return {
      state: "denied",
      title: "Tracking: location denied",
      detail: "Location permission is denied. Job-site suggestions are off. Enter time yourself."
    };
  }
  if (status.authorization === "approximate") {
    return {
      state: "approximate",
      title: "Tracking: location is approximate",
      detail: "This fix is too coarse to treat as a sure job match. Suggestions would still need your confirmation."
    };
  }
  if (status.armed) {
    return {
      state: "armed",
      title: "Tracking: on for today",
      detail: "Watching saved job sites you armed for today. Alerts can be late or missed. They are not hours until you confirm them. Turn this off when you are done. Device testing of locked-phone alerts has not been done."
    };
  }
  return {
    state: "off",
    title: "Tracking: off",
    detail: "Job-site suggestions are off. Your location is not being watched."
  };
}

export function webTrackingStatus() {
  return {
    platform: "web",
    backgroundGeofence: false,
    implementation: "none",
    armed: false,
    authorization: "unavailable",
    deviceTested: false
  };
}
