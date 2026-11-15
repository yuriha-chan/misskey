/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class R18Filter1779426672350 {
    name = 'R18Filter1779426672350'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "r18Filter" character varying(1024) array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "note" ADD "isR18" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "isR18"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "r18Filter"`);
    }
}
