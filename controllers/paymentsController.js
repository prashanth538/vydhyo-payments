const paymentModel = require('../models/paymentModel');
const sequenceSchema = require('../sequence/sequenceSchema');
const paymentSchema = require('../schemas/paymentSchema');
const { SEQUENCE_PREFIX } = require('../utils/constants');

exports.createPayment = async (req, res) => {
    try {
        const { error } = paymentSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                status: 'fail',
                message: error.details[0].message,
            });
        }

        req.body.createdBy = req.headers ? req.headers.userid : null;
        req.body.updatedBy = req.headers ? req.headers.userid : null;

        const paymentCounter = await sequenceSchema.findByIdAndUpdate({
            _id: SEQUENCE_PREFIX.PAYMENTS_SEQUENCE.PAYMENTS_MODEL
        }, { $inc: { seq: 1 } }, { new: true, upsert: true });

        req.body.paymentId = SEQUENCE_PREFIX.PAYMENTS_SEQUENCE.SEQUENCE.concat(paymentCounter.seq);
        req.body.finalAmount = calculateFinalAmount(req.body.actualAmount, req.body.discount, req.body.discountType);
        if (req.body.finalAmount < 0) {
            return res.status(400).json({
                status: 'fail',
                message: 'Final amount cannot be negative',
            });
        }
        const payment = await paymentModel.create(req.body);
        if (!payment) {
            return res.status(404).json({
                status: 'fail',
                message: 'payment not created',
            });
        }

        return res.status(200).json({
            status: 'success',
            message: 'payment created successfully',
            data: payment,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating appointment', error: error.message });
    }
};


function calculateFinalAmount(actualAmount, discount, discountType = 'flat') {
    if (discountType === 'percentage') {
        if (discount < 0 || discount > 100) {
            throw new Error('Invalid input: discount percentage must be between 0 and 100');
        }
        return actualAmount - (actualAmount * (discount / 100));
    }
    // Assuming discountType is 'flat' or any other type that is not percentage
    if (typeof actualAmount !== 'number' || typeof discount !== 'number') {
        throw new Error('Invalid input: actualAmount and discount must be numbers');
    }
    if (actualAmount < 0 || discount < 0) {
        throw new Error('Invalid input: actualAmount and discount must be non-negative');
    }
    return actualAmount - discount;
}