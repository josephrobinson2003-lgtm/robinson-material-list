/** Web stub. Background geofences and secure tokens are refused here. */
export class RobinsonGeofenceWeb {
  async getCapabilities() {
    return {
      platform: "web",
      backgroundGeofence: false,
      implementation: "none",
      secureStorage: false,
      coordinatesPersisted: false,
      deviceTested: false
    };
  }

  async armForToday() {
    throw new Error("background-geofence-unavailable");
  }

  async disarm() {
    return { armed: false };
  }

  async getPendingEvents() {
    return { events: [] };
  }

  async saveToken() {
    return { ok: false, reason: "secure-storage-unavailable" };
  }
}
