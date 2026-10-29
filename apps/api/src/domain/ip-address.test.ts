import { describe, expect, it } from 'vitest'
import { isIpLiteral, isPrivateAddress } from './ip-address'

describe('address classification', () => {
  it('refuses every address a server-side fetch must not reach', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::127.0.0.1',
      '::10.0.0.1',
      '999.1.1.1',
      'not-an-address',
    ]) {
      expect(isPrivateAddress(address)).toBe(true)
    }
  })

  it('allows a public address', () => {
    for (const address of [
      '1.1.1.1',
      '8.8.8.8',
      '172.32.0.1',
      '93.184.216.34',
      '2606:4700::1111',
    ]) {
      expect(isPrivateAddress(address)).toBe(false)
    }
  })

  it('separates an address literal from a host name', () => {
    expect(isIpLiteral('127.0.0.1')).toBe(true)
    expect(isIpLiteral('::1')).toBe(true)
    expect(isIpLiteral('example.com')).toBe(false)
  })
})
