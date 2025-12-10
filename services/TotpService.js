import { authenticator } from 'otplib'
import crypto from 'crypto'

// Configure TOTP according to RFC 6238
authenticator.options = {
  step: 30, // 30 seconds per code
  window: [1, 1] // Accept codes from -1 to +1 period (90 seconds total)
}

export class TotpService {
  /**
   * Generate a new TOTP secret
   * @returns {string} Base32 encoded secret
   */
  static generateSecret() {
    return authenticator.generateSecret()
  }

  /**
   * Generate TOTP code from secret
   * @param {string} secret - Base32 encoded secret
   * @returns {string} 6-digit code
   */
  static generateToken(secret) {
    return authenticator.generate(secret)
  }

  /**
   * Verify TOTP code
   * @param {string} token - 6-digit code to verify
   * @param {string} secret - Base32 encoded secret
   * @returns {boolean} True if valid
   */
  static verifyToken(token, secret) {
    try {
      return authenticator.verify({ token, secret })
    } catch (error) {
      return false
    }
  }

  /**
   * Generate QR Code data URL for authenticator app
   * @param {string} secret - Base32 encoded secret
   * @param {string} email - User email
   * @param {string} issuer - Service name
   * @returns {string} otpauth:// URL
   */
  static generateOtpAuthUrl(secret, email, issuer = 'Mutual Fintech') {
    return authenticator.keyuri(email, issuer, secret)
  }

  /**
   * Generate recovery codes
   * @param {number} count - Number of codes to generate (default: 10)
   * @returns {string[]} Array of recovery codes
   */
  static generateRecoveryCodes(count = 10) {
    const codes = []
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase()
      codes.push(code)
    }
    return codes
  }

  /**
   * Hash recovery code for storage
   * @param {string} code - Plain recovery code
   * @returns {string} SHA-256 hash
   */
  static hashRecoveryCode(code) {
    return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex')
  }

  /**
   * Verify recovery code
   * @param {string} code - Plain recovery code
   * @param {string} hash - Stored hash
   * @returns {boolean} True if valid
   */
  static verifyRecoveryCode(code, hash) {
    const codeHash = this.hashRecoveryCode(code)
    return crypto.timingSafeEqual(
      Buffer.from(codeHash, 'hex'),
      Buffer.from(hash, 'hex')
    )
  }
}

