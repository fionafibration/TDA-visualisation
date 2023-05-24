import {isZero, NormalForm} from "@tdajs/normal-form";
import {grahamScan} from 'flo-graham-scan'
import _ from 'lodash'

let c = document.getElementById('tdacanvas')

let showballs = true;

let interact_mode = "add"

let points = [] // 0-simplices, n-simplices generated by Cech complex.

let simplices = [] // 0-th index is 1-simplices, etc.

let epsilon = 20
let lastepsilon = 20

let distMatrix = []
let adjMatrix = []

let distCrossings = []


c.width = window.innerWidth
c.height = window.innerHeight - 200

let ctx = c.getContext("2d")

ctx.fill()

function arrayEquals(a, b) {
    return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}

// Simplex color coding 
function getColor(n) {
    // 2 simplices
    if (n === 3) {
        return "rgba(20, 20, 255, 0.1)"
    }
    // 3 simplices
    if (n === 4) {
        return "rgba(20, 255, 20, 0.1)"
    }
    // otherwise
    return "rgba(255, 20, 255, 0.1)"
}


// Variable for timeout calls to recalculate
var recalculateTimeout = null

// Recalculate simplices
function recalculate() {
    console.log('recalculating')
    get_1simplices()
    get_nsimplices(2)
    //get_nsimplices(3)
    //get_nsimplices(4)
    requestAnimationFrame(do_update)
    document.getElementById('homologyresults').innerHTML = computeHomology(1) //+ '\n' + computeHomology(2)
}

// Set recalculate timeout
function do_recalculate() {
    if (recalculateTimeout) {
        clearTimeout(recalculateTimeout)
    }
    recalculateTimeout = setTimeout(recalculate, 20)
}

document.getElementById('mode_select').oninput = function () {
    interact_mode = this.value
}

document.getElementById('epsilon').oninput = function () {
    epsilon = this.value / 50
    for (let x of distCrossings) {
        x = x / 2
        if (((lastepsilon < x) && (x < epsilon)) || ((epsilon < x) && (x < lastepsilon))) {
            do_recalculate()
        }
    }
    lastepsilon = epsilon
    requestAnimationFrame(do_update)
}

document.getElementById('showballs').oninput = function () {
    showballs = this.checked
    requestAnimationFrame(do_update)
}


let Point = class Point {
    constructor(x, y) {
        this.x = x
        this.y = y
    }

    d(x, y) {
        return Math.sqrt(Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2))
    }
}

function face(i, smplx) {
    let new_smplx = [...smplx]
    new_smplx.splice(i, 1);
    return new_smplx
}

function rank(m) {
    if (isZero(m)) {
        return 0
    }
    let smith = new NormalForm(m);
    return smith.diag.length
}

function boundary(n) { // get n-th boundary matrix
    let num_n_smplx = simplices[n - 1].length
    let num_n_1_smplx = 0
    // n-1 simplices are points
    if (n === 1) {
        num_n_1_smplx = points.length
    } else {
        num_n_1_smplx = simplices[n - 2].length
    }
    if (num_n_smplx === 0) {
        return new Array(1).fill(0).map(() => new Array(num_n_1_smplx).fill(0));
    }

    let boundaryMat = Array(num_n_smplx).fill(0).map(() => new Array(num_n_1_smplx).fill(0));

    if (n === 1) {
        for (let i = 0; i < num_n_smplx; i++) {
            let nsmplx = simplices[n - 1][i]
            for (let j = 0; j < n + 1; j++) {
                boundaryMat[i][nsmplx[j]] = Math.pow(-1, j)
            }
        }
    } else {
        for (let i = 0; i < num_n_smplx; i++) {
            let nsmplx = simplices[n - 1][i]

            for (let j = 0; j < num_n_1_smplx; j++) {

                let n1_smplx = simplices[n - 2][j];

                for (let fidx = 0; fidx < n + 1; fidx++) {
                    let testsmplx = face(fidx, nsmplx)
                    if (arrayEquals(testsmplx, n1_smplx)) {
                        boundaryMat[i][j] = Math.pow(-1, fidx)
                    }
                }
            }
        }
    }

    console.log(n + '-boundary')
    console.log(num_n_smplx + ' x ' + num_n_1_smplx)
    console.log('rows:')
    console.log(simplices[n - 1])
    console.log('columns:')
    console.log(simplices[n - 2])
    console.log(boundaryMat)
    return boundaryMat
}

function computeHomology(n) {
    // Given Z^l --A-> Z^m --B--> Z^k s.t. BA = 0, the homology at middle is given by
    // r = rank(A), s = rank(B), a_i are the elementary divisors of A
    // \oplus_{i=1}^{r} Z/a_i \oplus Z^(m-r-s)


    let m = simplices[n - 1].length

    let A = boundary(n)
    let B = boundary(n + 1)

    let r = rank(A)
    let s = rank(B)

    let ai = []

    if (!isZero(A)) {
        ai = new NormalForm(A).diag
    }

    let homstring = "H_" + n + " = "

    for (const torsion of ai) {
        if (torsion !== 1) {
            homstring += "ℤ/" + torsion.toString() + " "
        }
    }

    homstring += "ℤ^" + (m - r - s).toString()

    return homstring
}


function drawSimplex(pts) { // draw a simplex from an array of point IDs
    let positions = []
    for (const id of pts) {
        positions.push([points[id].x, points[id].y])
    }
    let outer = grahamScan(positions)
    ctx.beginPath()
    ctx.moveTo(outer[0][0], outer[0][1])
    for (let i = 1; i < outer.length; i++) {
        ctx.lineTo(outer[i][0], outer[i][1])
    }
    if (pts.length > 2) {
        ctx.fillStyle = getColor(pts.length)
        ctx.fill()
    }
    ctx.strokeStyle = "rgb(40, 40, 40)"
    ctx.stroke()
}

function get_nsimplex_candidates_helper(n, k, j) {
    if (k === 1) {
        return _.range(j).map((x) => [x])
    }
    let v = []
    for (let i = k - 1; i < j; i++) {

        let z = get_nsimplex_candidates_helper(n, k - 1, i)
        for (const x of z) {
            x.push(i)
        }
        v.push(...z)
    }
    return v
}

function get_nsimplex_candidates(n, k) {
    if (k > n) {
        return []
    }
    if (k === 1) {
        return _.range(n).map((x) => [x])
    }
    let v = []
    for (let i = k - 1; i < n; i++) {
        let z = get_nsimplex_candidates_helper(n, k - 1, i)
        for (const x of z) {
            x.push(i)
        }
        v.push(...z)
    }
    return v
}

function cartesian(n, k) {
    if (k === 1) {
        return _.range(n).map((x) => [x])
    }
    let v = []
    for (let i = 0; i < n; i++) {
        let z = cartesian(n, k - 1)
        for (const x of z) {
            x.push(i)
        }
        v.push(...z)
    }
    return v
}

function calcDistances() {
    distMatrix = []
    adjMatrix = []
    simplices[0] = []
    distMatrix = Array(points.length - 1).fill(0).map(() => new Array(points.length - 1).fill(0));
    adjMatrix = Array(points.length - 1).fill(0).map(() => new Array(points.length - 1).fill(() => 0));
    for (let i = 0; i < points.length; i++) {
        for (let k = i; k < points.length; k++) {
            if (i === k) {
                continue
            }
            let dist = points[i].d(points[k].x, points[k].y)

            distMatrix[i][k] = dist
            adjMatrix[i][k] = () => (dist < epsilon * 2 ? 1 : 0)
            distCrossings.push(dist)
        }
    }
    distCrossings = _.uniq(distCrossings)
}

function get_1simplices() {
    simplices[0] = []
    for (let i = 0; i < points.length; i++) {
        for (let k = i; k < points.length; k++) {
            if (i === k) {
                continue
            }
            if (distMatrix[i][k] < epsilon * 2) {
                simplices[0].push([i, k])
            }
        }
    }
}

function get_nsimplices(n) { // only for n > 2
    simplices[n - 1] = [];
    let candidates = get_nsimplex_candidates(points.length, n + 1)
    for (const cnd of candidates) {
        let found = 0

        for (let smplx of simplices[n - 2]) {
            if (_.isEqual(cnd.slice(1), smplx)) {
                found |= 1
            }
            if (_.isEqual(cnd.slice(0, cnd.length - 1), smplx)) {
                found |= 2
            }
        }
        for (let smplx of simplices[0]) {
            if (_.isEqual([cnd[0], cnd[cnd.length - 1]], smplx)) {
                found |= 4
            }
        }
        if (found === 7) {
            simplices[n - 1].push(cnd)
        }
    }
}


function get_real_pos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return [evt.clientX - rect.left, evt.clientY - rect.top]
}

window.addEventListener('click', function (event) {
    let pos = get_real_pos(c, event)
    let x = pos[0];
    let y = pos[1]

    if (x < 0 || x > c.width || y < 0 || y > c.height) {
        return
    }
    if (interact_mode === "add") {
        let p = new Point(x, y)
        points.push(p)
        calcDistances()
        do_recalculate()
    }
    if (interact_mode === "remove") {
        for (let i = 0; i < points.length; i++) {
            if (points[i].d(x, y) <= 5) {
                //console.log('removed ' + i + '-th point')
                points.splice(i, 1);
                calcDistances()
                do_recalculate()
                requestAnimationFrame(do_update)
                return
            }
        }
    }
    requestAnimationFrame(do_update)
})

function do_update(t) {
    //requestAnimationFrame(do_update)
    ctx.clearRect(0, 0, c.width, c.height)

    ctx.fillStyle = "rgba(220, 220, 220, 30)"
    ctx.strokeStyle = "rgb(0, 0, 255)"

    if (showballs) {
        for (const p of points) {
            ctx.beginPath()
            ctx.arc(p.x, p.y, epsilon, 0, 2 * Math.PI, false)
            ctx.fill()
        }
        for (const p of points) {
            ctx.beginPath()
            ctx.arc(p.x, p.y, epsilon, 0, 2 * Math.PI, false)
            ctx.stroke()
        }
    }

    ctx.fillStyle = "rgb(0, 0, 0)"
    for (const p of points) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI, false)
        ctx.fill()
    }

    for (let i = 0; i < simplices.length; i++) {
        for (const splx of simplices[i]) {
            drawSimplex(splx)
        }
    }
}


//setInterval(function () {requestAnimationFrame(do_update)}, 500)
requestAnimationFrame(do_update)
