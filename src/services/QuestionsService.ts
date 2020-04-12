import ServiceServer from '../common/ServiceServer'
import { pack, unpack } from 'msgpack'
import fetch from 'node-fetch'
import r from 'rethinkdb'
import Flake from '../common/utils/Flake'
import User from '../common/dataStructures/User'

// The flake service for generating ids.
const flake = new Flake({
    timeOffset: 1586690487
})

const { redis, server } = new ServiceServer({ prometheus: true, healthEndpoint: true, authRequired: true })

function shuffle (array = []) {
    let shuffleCount = Math.floor(Math.random() * array.length)
    while(shuffleCount !== 0) {
        array.push(array[0])
        array.shift()
        shuffleCount--
    }
    return array
}

type Question = {
    category: string,
    type: string,
    difficulty: string,
    question: string,
    correct_answer: string,
    incorrect_answers: string[]
}

async function loadQuestions(difficulty = undefined, amount = 1): Promise<Question[]> {
    return await fetch(`https://opentdb.com/api.php?amount=${amount}${(difficulty ? `&difficulty=${difficulty}` : '')}`)
    .then(data => data.json())
    .then(({response_code, results}): Question[] => {
        return response_code === 0 ? results : []
    })
}

const difficulty_ = ['easy', 'medium', 'hard'];

(async () => {
    difficulty_.forEach(async difficulty => {
        if(await redis.llen(`questions_${difficulty}`) < 500)
            redis.lpush(`questions_${difficulty}`, await (await loadQuestions(difficulty, 50)).map(x => pack(x)))
    })
})()

async function cachePop(difficulty) {
    if(await redis.llen(`questions_${difficulty}`) < 500)
        redis.lpush(`questions_${difficulty}`, await (await loadQuestions('hard', 50)).map(x => pack(x)))
    return redis.lpopBuffer(`questions_${difficulty}`)
        .then(x => unpack(x))
}

function randomDifficulty() {
    return difficulty_[Math.floor(Math.random() * difficulty_.length)]
}

server.get(`/api/questions`, async (request, response) => {
    let { difficulty = randomDifficulty() } = request.query
    if(!difficulty_.includes(difficulty)) difficulty = randomDifficulty()
    const { question, correct_answer, incorrect_answers, ...meta } = await cachePop(difficulty)
    const answer_id = flake.gen()
    
	await redis.set(`answer-cache-${answer_id}`, pack({ 
        answer: correct_answer,
        user: 0,
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
    const { rethink } = request
    if(!question || !answer) {
        response.code(400)
        return
    }
    const redis_raw = await redis.getBuffer(`answer-cache-${question}`)
    if(!redis_raw) {
        response.send({
            'error': 'Invalid code.'
        })
        response.code(400)
        return
    }
    const redis_payload: { user: string, answer: string } = unpack(redis_raw)
    if(redis_payload.user === request.user.id) {
        if(answer === redis_payload.answer) {
            await r.db('kuizz')
                   .table('users')
                   .filter({ id: redis_payload.user })
                   .update({ wins: r.row('wins').add(1) })
                   .run(rethink)
        } else {
            await r.db('kuizz')
                .table('users')
                .filter({ id: redis_payload.user })
                .update({ lost: r.row('lost').add(1) })
                .run(rethink)
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