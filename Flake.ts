export class Flake {
    private seq: number
    private mid: number
    private timeOffset: any
    private lastTime: number
  
    constructor (options?: { timeOffset?: number, mid?: number }) {
      options = options || {}
      this.seq = 0
      this.mid = (options.mid || 1) % 1023
      this.timeOffset = options.timeOffset || 0
      this.lastTime = 0
    }
  
    private add (x: number[], y: number[], base: number): number[] {
      const z: number[] = []
      const n = Math.max(x.length, y.length)
      let carry = 0
      let i = 0
      while (i < n || carry) {
        const xi = i < x.length ? x[i] : 0
        const yi = i < y.length ? y[i] : 0
        const zi = carry + xi + yi
        z.push(zi % base)
        carry = Math.floor(zi / base)
        i++
      }
      return z
    }
  
    private multiplyByNumber (num: number, power: number[], base: number): number[] {
      if (num < 0) return null
      if (num === 0) return []
      let result: number[] = []
      while (true) {
        if (num & 1) {
          result = this.add(result, power, base)
        }
        num = num >> 1
        if (num === 0) break
        power = this.add(power, power, base)
      }
      return result
    }
  
    private parseToDigitsArray (str: string, base: number): number[] {
      const digits = str.split('')
      const ary: number[] = []
      for (let i = digits.length - 1; i >= 0; i--) {
        const n = parseInt(digits[i], base)
        if (isNaN(n)) return null
        ary.push(n)
      }
      return ary
    }
  
    private convertBase (str, fromBase, toBase): string {
      const digits = this.parseToDigitsArray(str, fromBase)
      if (digits === null) return null
      let outArray: number[] = []
      let power: number[] = [1]
      for (let i = 0; i < digits.length; i++) {
        if (digits[i]) {
          outArray = this.add(
            outArray,
            this.multiplyByNumber(digits[i], power, toBase),
            toBase
          )
        }
        power = this.multiplyByNumber(fromBase, power, toBase)
      }
      let out = ''
      for (let i = outArray.length - 1; i >= 0; i--) {
        out += outArray[i].toString(toBase)
      }
      return out
    }
  
    private hexToDec (hexStr): string {
      if (hexStr.substring(0, 2) === '0x') hexStr = hexStr.substring(2)
      hexStr = hexStr.toLowerCase()
      return this.convertBase(hexStr, 16, 10)
    }
  
    public gen () {
      const time = Date.now()
      const bTime = (time - this.timeOffset).toString(2)
      if (this.lastTime === time) {
        this.seq++
        if (this.seq > 4095) {
          this.seq = 0
          while (Date.now() <= time) {}
        }
      } else {
        this.seq = 0
      }
      this.lastTime = time
      let bSeq = this.seq.toString(2)
      let bMid = this.mid.toString(2)
      while (bSeq.length < 12) bSeq = '0' + bSeq
      while (bMid.length < 10) bMid = '0' + bMid
      const bid = bTime + bMid + bSeq
      let id = ''
      for (let i = bid.length; i > 0; i -= 4) {
        id = parseInt(bid.substring(i - 4, i), 2).toString(16) + id
      }
      return this.hexToDec(id)
    }
  }
  