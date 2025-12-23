export class HealthController {
  async health(req, res) {
    return res.json({ ok: true, service: "wallet-service", timestamp: new Date().toISOString() })
  }
}
export const healthController = new HealthController()
