import ServiceServer from '../ServiceServer'
import { sign, verify } from 'jsonwebtoken'
import { Flake } from '../Flake'
import { pack, unpack } from 'msgpack'
import fetch from 'node-fetch'
import r from 'rethinkdb'

const { 
    REDIS_URL,
    JWT_KEY,
    RETHINK,
    RETHINK_PASSWORD,
    RETHINK_USER,
    RETHINK_PORT,
    RETHINK_DB
 } = process.env

// The flake service for generating ids.
const flake = new Flake

// Rethinkdb
let db: r.Connection

(async () => {
    db = await r.connect({
        host: RETHINK,
        port: parseInt(RETHINK_PORT),
        db: RETHINK_DB,
    })
})()

// The structure of a user in the database.
type User = {
    id: string,
    discord?: string,
    google?:  string,
    username: string,
    locale: string,
    score: number,
    avatar: string
}

const { server, redis } = new ServiceServer({}, { prometheus: true, healthEndpoint: true, authRequired: true }, REDIS_URL)

const shuffle = (array = []) => {
    let shuffleCount = Math.floor(Math.random() * array.length)
    while(shuffleCount !== 0) {
        array.push(array[0])
        array.shift()
        shuffleCount--
    }
    return array
}

server.get(`/api/questions`, async (request, response) => {
    const { difficulty } = request.query
    const data = await fetch(`https://opentdb.com/api.php?amount=1${(difficulty ? `&difficulty=${difficulty}` : '')}`)
        .then(data => data.json())
        .then(({response_code, results}) => {
            return response_code === 0 ? results : null
        })
	if(!data)
		return
			
    const { question, correct_answer, incorrect_answers, ...meta } = data[0]
    const user = verify(request.headers['authorization'].substr(7, request.headers['authorization'].length), JWT_KEY) as User

	const answer_id = flake.gen()
	await redis.set(`answer-cache-${answer_id}`, pack({ 
        answer: correct_answer,
        user: user.id,
    }), 'EX', '25')
    response.send({
		question: question,
		answers: shuffle([...incorrect_answers, correct_answer]),
        answer_id: answer_id,
		meta
	})
})

server.post(`/api/questions/validate`, async (request, response) => {
    const { question, answer } = request.query

    if(!question || !answer) {
        response.code(400)
        return
    }
    const user = verify(request.headers['authorization'].substr(7, request.headers['authorization'].length), JWT_KEY) as User
    console.log(user)
    const redis_raw = await redis.getBuffer(`answer-cache-${question}`)
    if(!redis_raw) {
        response.send({
            'error': 'Invalid code.'
        })
        response.code(400)
        return
    }
    
    const redis_payload: { user: string, answer: string } = unpack(redis_raw)

    if(redis_payload.user === user.id) {
        if(answer === redis_payload.answer) {
            await r.db('kuizz')
                   .table('users')
                   .filter({ id: redis_payload.user })
                   .update({ score: r.row('score').add(1) })
                   .run(db)
        }

        response.send({
            success: answer === redis_payload.answer,
            answer: redis_payload.answer
        })
    } else {
        response.send({
            error: 'Invalid token for user!'
        })
        response.code(400)
    }
})