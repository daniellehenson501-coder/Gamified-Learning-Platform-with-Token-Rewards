(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-COURSE-ID u101)
(define-constant ERR-INVALID-USER u102)
(define-constant ERR-INVALID-SCORE u103)
(define-constant ERR-INVALID-THRESHOLD u104)
(define-constant ERR-INVALID-PROOF u105)
(define-constant ERR-ALREADY-VERIFIED u106)
(define-constant ERR-NOT-VERIFIED u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-ORACLE-NOT-VERIFIED u109)
(define-constant ERR-INVALID-NFT-ID u110)
(define-constant ERR-INVALID-REWARD-AMOUNT u111)
(define-constant ERR-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-VERIFICATIONS-EXCEEDED u114)
(define-constant ERR-INVALID-VERIFICATION-TYPE u115)
(define-constant ERR-INVALID-DIFFICULTY u116)
(define-constant ERR-INVALID-EXPIRY u117)
(define-constant ERR-INVALID-METADATA u118)
(define-constant ERR-INVALID-STATUS u119)
(define-constant ERR-INVALID-ORACLE u120)
(define-constant ERR-TRANSFER-FAILED u121)
(define-constant ERR-NFT-ALREADY-ISSUED u122)
(define-constant ERR-INVALID-OWNER u123)
(define-constant ERR-INSUFFICIENT-BALANCE u124)
(define-constant ERR-INVALID-CHALLENGE u125)

(define-data-var next-verification-id uint u0)
(define-data-var max-verifications uint u10000)
(define-data-var verification-fee uint u500)
(define-data-var oracle-principal (optional principal) none)
(define-data-var reward-contract (optional principal) none)
(define-data-var nft-contract (optional principal) none)
(define-data-var admin-principal principal tx-sender)

(define-map verifications
  uint
  {
    course-id: uint,
    user: principal,
    score: uint,
    threshold: uint,
    proof-hash: (buff 32),
    timestamp: uint,
    verifier: principal,
    verification-type: (string-ascii 20),
    difficulty: uint,
    expiry: uint,
    metadata: (string-utf8 256),
    status: bool
  }
)

(define-map verifications-by-user
  { user: principal, course-id: uint }
  uint)

(define-map verification-updates
  uint
  {
    update-score: uint,
    update-threshold: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-map certificates
  uint
  {
    verification-id: uint,
    owner: principal,
    issued-at: uint,
    metadata: (string-utf8 256)
  }
)

(define-read-only (get-verification (id uint))
  (map-get? verifications id)
)

(define-read-only (get-verification-updates (id uint))
  (map-get? verification-updates id)
)

(define-read-only (get-certificate (nft-id uint))
  (map-get? certificates nft-id)
)

(define-read-only (is-verified (user principal) (course-id uint))
  (is-some (map-get? verifications-by-user { user: user, course-id: course-id }))
)

(define-private (validate-course-id (course uint))
  (if (> course u0)
      (ok true)
      (err ERR-INVALID-COURSE-ID))
)

(define-private (validate-user (user principal))
  (if (not (is-eq user 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-USER))
)

(define-private (validate-score (score uint))
  (if (and (>= score u0) (<= score u100))
      (ok true)
      (err ERR-INVALID-SCORE))
)

(define-private (validate-threshold (threshold uint))
  (if (and (> threshold u0) (<= threshold u100))
      (ok true)
      (err ERR-INVALID-THRESHOLD))
)

(define-private (validate-proof (proof (buff 32)))
  (if (is-eq (len proof) u32)
      (ok true)
      (err ERR-INVALID-PROOF))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-verification-type (vtype (string-ascii 20)))
  (if (or (is-eq vtype "quiz") (is-eq vtype "oracle") (is-eq vtype "challenge"))
      (ok true)
      (err ERR-INVALID-VERIFICATION-TYPE))
)

(define-private (validate-difficulty (diff uint))
  (if (and (>= diff u1) (<= diff u10))
      (ok true)
      (err ERR-INVALID-DIFFICULTY))
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
      (ok true)
      (err ERR-INVALID-EXPIRY))
)

(define-private (validate-metadata (meta (string-utf8 256)))
  (if (<= (len meta) u256)
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (validate-oracle (oracle principal))
  (match (var-get oracle-principal)
    set-oracle (if (is-eq oracle set-oracle) (ok true) (err ERR-INVALID-ORACLE))
    (err ERR-ORACLE-NOT-VERIFIED))
)

(define-public (set-oracle-principal (new-oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-user new-oracle))
    (var-set oracle-principal (some new-oracle))
    (ok true)
  )
)

(define-public (set-reward-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-user contract))
    (var-set reward-contract (some contract))
    (ok true)
  )
)

(define-public (set-nft-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-user contract))
    (var-set nft-contract (some contract))
    (ok true)
  )
)

(define-public (set-verification-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set verification-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-verifications (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-verifications new-max)
    (ok true)
  )
)

(define-public (submit-verification
  (course-id uint)
  (score uint)
  (threshold uint)
  (proof-hash (buff 32))
  (verification-type (string-ascii 20))
  (difficulty uint)
  (expiry uint)
  (metadata (string-utf8 256))
)
  (let (
    (next-id (var-get next-verification-id))
    (current-max (var-get max-verifications))
    (oracle (var-get oracle-principal))
    (is-oracle-submission (is-eq verification-type "oracle"))
  )
    (asserts! (< next-id current-max) (err ERR-MAX-VERIFICATIONS-EXCEEDED))
    (try! (validate-course-id course-id))
    (try! (validate-score score))
    (try! (validate-threshold threshold))
    (try! (validate-proof proof-hash))
    (try! (validate-verification-type verification-type))
    (try! (validate-difficulty difficulty))
    (try! (validate-expiry expiry))
    (try! (validate-metadata metadata))
    (asserts! (is-none (map-get? verifications-by-user { user: tx-sender, course-id: course-id })) (err ERR-ALREADY-VERIFIED))
    (if is-oracle-submission
        (try! (validate-oracle tx-sender))
        true
    )
    (try! (stx-transfer? (var-get verification-fee) tx-sender (var-get admin-principal)))
    (map-set verifications next-id
      {
        course-id: course-id,
        user: tx-sender,
        score: score,
        threshold: threshold,
        proof-hash: proof-hash,
        timestamp: block-height,
        verifier: (if is-oracle-submission tx-sender 'SP000000000000000000002Q6VF78),
        verification-type: verification-type,
        difficulty: difficulty,
        expiry: expiry,
        metadata: metadata,
        status: (>= score threshold)
      }
    )
    (map-set verifications-by-user { user: tx-sender, course-id: course-id } next-id)
    (var-set next-verification-id (+ next-id u1))
    (print { event: "verification-submitted", id: next-id, status: (>= score threshold) })
    (if (>= score threshold)
        (try! (issue-certificate-internal next-id tx-sender metadata))
        (ok next-id)
    )
  )
)

(define-private (issue-certificate-internal (verification-id uint) (owner principal) (metadata (string-utf8 256)))
  (let (
    (nft-id verification-id)
    (nft-contr (unwrap! (var-get nft-contract) (err ERR-NOT-VERIFIED)))
  )
    (asserts! (is-none (map-get? certificates nft-id)) (err ERR-NFT-ALREADY-ISSUED))
    (map-set certificates nft-id
      {
        verification-id: verification-id,
        owner: owner,
        issued-at: block-height,
        metadata: metadata
      }
    )
    (try! (as-contract (contract-call? nft-contr mint owner nft-id)))
    (try! (trigger-reward verification-id))
    (print { event: "certificate-issued", nft-id: nft-id })
    (ok nft-id)
  )
)

(define-private (trigger-reward (verification-id uint))
  (let (
    (reward-contr (unwrap! (var-get reward-contract) (err ERR-NOT-VERIFIED)))
    (verification (unwrap! (map-get? verifications verification-id) (err ERR-NOT-VERIFIED)))
    (user (get user verification))
    (reward-amount (* (get difficulty verification) u100))
  )
    (asserts! (get status verification) (err ERR-NOT-VERIFIED))
    (try! (as-contract (contract-call? reward-contr distribute-reward user reward-amount)))
    (ok true)
  )
)

(define-public (update-verification
  (verification-id uint)
  (new-score uint)
  (new-threshold uint)
)
  (let ((verification (map-get? verifications verification-id)))
    (match verification
      v
        (begin
          (asserts! (is-eq (get user v) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-score new-score))
          (try! (validate-threshold new-threshold))
          (map-set verifications verification-id
            (merge v {
              score: new-score,
              threshold: new-threshold,
              timestamp: block-height
            })
          )
          (map-set verification-updates verification-id
            {
              update-score: new-score,
              update-threshold: new-threshold,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "verification-updated", id: verification-id })
          (ok true)
        )
      (err ERR-NOT-VERIFIED)
    )
  )
)

(define-public (get-verification-count)
  (ok (var-get next-verification-id))
)

(define-public (check-verification-status (user principal) (course-id uint))
  (match (map-get? verifications-by-user { user: user, course-id: course-id })
    id (let ((v (unwrap-panic (map-get? verifications id))))
         (ok (get status v)))
    (ok false)
  )
)