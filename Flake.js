"use strict";
exports.__esModule = true;
var Flake = /** @class */ (function () {
    function Flake(options) {
        options = options || {};
        this.seq = 0;
        this.mid = (options.mid || 1) % 1023;
        this.timeOffset = options.timeOffset || 0;
        this.lastTime = 0;
    }
    Flake.prototype.add = function (x, y, base) {
        var z = [];
        var n = Math.max(x.length, y.length);
        var carry = 0;
        var i = 0;
        while (i < n || carry) {
            var xi = i < x.length ? x[i] : 0;
            var yi = i < y.length ? y[i] : 0;
            var zi = carry + xi + yi;
            z.push(zi % base);
            carry = Math.floor(zi / base);
            i++;
        }
        return z;
    };
    Flake.prototype.multiplyByNumber = function (num, power, base) {
        if (num < 0)
            return null;
        if (num === 0)
            return [];
        var result = [];
        while (true) {
            if (num & 1) {
                result = this.add(result, power, base);
            }
            num = num >> 1;
            if (num === 0)
                break;
            power = this.add(power, power, base);
        }
        return result;
    };
    Flake.prototype.parseToDigitsArray = function (str, base) {
        var digits = str.split('');
        var ary = [];
        for (var i = digits.length - 1; i >= 0; i--) {
            var n = parseInt(digits[i], base);
            if (isNaN(n))
                return null;
            ary.push(n);
        }
        return ary;
    };
    Flake.prototype.convertBase = function (str, fromBase, toBase) {
        var digits = this.parseToDigitsArray(str, fromBase);
        if (digits === null)
            return null;
        var outArray = [];
        var power = [1];
        for (var i = 0; i < digits.length; i++) {
            if (digits[i]) {
                outArray = this.add(outArray, this.multiplyByNumber(digits[i], power, toBase), toBase);
            }
            power = this.multiplyByNumber(fromBase, power, toBase);
        }
        var out = '';
        for (var i = outArray.length - 1; i >= 0; i--) {
            out += outArray[i].toString(toBase);
        }
        return out;
    };
    Flake.prototype.hexToDec = function (hexStr) {
        if (hexStr.substring(0, 2) === '0x')
            hexStr = hexStr.substring(2);
        hexStr = hexStr.toLowerCase();
        return this.convertBase(hexStr, 16, 10);
    };
    Flake.prototype.gen = function () {
        var time = Date.now();
        var bTime = (time - this.timeOffset).toString(2);
        if (this.lastTime === time) {
            this.seq++;
            if (this.seq > 4095) {
                this.seq = 0;
                while (Date.now() <= time) { }
            }
        }
        else {
            this.seq = 0;
        }
        this.lastTime = time;
        var bSeq = this.seq.toString(2);
        var bMid = this.mid.toString(2);
        while (bSeq.length < 12)
            bSeq = '0' + bSeq;
        while (bMid.length < 10)
            bMid = '0' + bMid;
        var bid = bTime + bMid + bSeq;
        var id = '';
        for (var i = bid.length; i > 0; i -= 4) {
            id = parseInt(bid.substring(i - 4, i), 2).toString(16) + id;
        }
        return this.hexToDec(id);
    };
    return Flake;
}());
exports.Flake = Flake;
