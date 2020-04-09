import { argv } from 'process'

(async () => {
    const service = argv[2]
    console.log(service)
    require(service)
})()